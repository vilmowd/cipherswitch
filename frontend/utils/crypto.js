/**
 * Client-side zero-knowledge crypto helpers (v2).
 * Argon2id (hash-wasm) → AES-GCM-256 + HMAC-SHA256 integrity.
 * Encrypts message AND title. Server never sees passphrases or plaintext.
 */

import { argon2id } from "hash-wasm";

export const CRYPTO_VERSION = 2;
export const KDF_ID = "argon2id";

const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MIN_PASSPHRASE_LENGTH = 14;

/** Argon2id params — interactive but memory-hard (~64 MiB). */
const ARGON2 = {
  memorySize: 65536, // KiB
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function assertSubtle() {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error(
      "Web Crypto API is unavailable. Use a modern browser over HTTPS (or localhost)."
    );
  }
  return window.crypto.subtle;
}

export function toBase64(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(b64) {
  if (typeof b64 !== "string" || !b64.trim()) {
    throw new Error("Invalid base64 input");
  }
  const normalized = b64.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Estimate passphrase strength for UI feedback (not a substitute for entropy).
 */
export function scorePassphrase(passphrase) {
  const p = passphrase || "";
  let score = 0;
  if (p.length >= 14) score += 1;
  if (p.length >= 20) score += 1;
  if (p.length >= 28) score += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score += 1;
  if (/\d/.test(p)) score += 1;
  if (/[^A-Za-z0-9]/.test(p)) score += 1;
  if (/(.)\1{3,}/.test(p)) score = Math.max(0, score - 1);
  if (/password|qwerty|12345|letmein|admin/i.test(p)) score = Math.min(score, 1);

  const labels = ["too weak", "weak", "fair", "strong", "excellent", "fortress", "fortress"];
  return { score, label: labels[Math.min(score, 6)], ok: score >= 3 && p.length >= MIN_PASSPHRASE_LENGTH };
}

function assertPassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
  const { ok } = scorePassphrase(passphrase);
  if (!ok) {
    throw new Error(
      "Passphrase is too weak. Mix upper/lower case, digits, and symbols (14+ chars)."
    );
  }
}

/**
 * Argon2id → 32-byte master secret, then HKDF-style split via Web Crypto digests
 * into AES key material and HMAC key material.
 */
async function deriveMasterKey(passphrase, saltBytes) {
  assertSubtle();
  if (!(saltBytes instanceof Uint8Array) || saltBytes.length < 8) {
    throw new Error("Salt must be a Uint8Array of at least 8 bytes");
  }

  const hashHex = await argon2id({
    password: passphrase,
    salt: saltBytes,
    parallelism: ARGON2.parallelism,
    iterations: ARGON2.iterations,
    memorySize: ARGON2.memorySize,
    hashLength: ARGON2.hashLength,
    outputType: "hex",
  });

  const master = new Uint8Array(hashHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
  return master;
}

async function importAesKey(raw32) {
  const subtle = assertSubtle();
  return subtle.importKey("raw", raw32, { name: "AES-GCM", length: KEY_LENGTH_BITS }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function importHmacKey(raw32) {
  const subtle = assertSubtle();
  return subtle.importKey("raw", raw32, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Split master into AES + HMAC keys via domain-separated SHA-256. */
async function expandKeys(master) {
  const subtle = assertSubtle();
  const aesInput = concatBytes(TEXT_ENCODER.encode("ciphervault/aes/v2"), master);
  const macInput = concatBytes(TEXT_ENCODER.encode("ciphervault/mac/v2"), master);
  const aesRaw = new Uint8Array(await subtle.digest("SHA-256", aesInput));
  const macRaw = new Uint8Array(await subtle.digest("SHA-256", macInput));
  try {
    return {
      aesKey: await importAesKey(aesRaw),
      hmacKey: await importHmacKey(macRaw),
    };
  } finally {
    aesRaw.fill(0);
    macRaw.fill(0);
  }
}

async function hmacSign(hmacKey, ...parts) {
  const subtle = assertSubtle();
  const data = concatBytes(...parts);
  const sig = await subtle.sign("HMAC", hmacKey, data);
  return new Uint8Array(sig);
}

async function hmacVerify(hmacKey, signature, ...parts) {
  const subtle = assertSubtle();
  const data = concatBytes(...parts);
  return subtle.verify("HMAC", hmacKey, signature, data);
}

/**
 * Build plaintext envelope (message + optional attachments) then encrypt.
 * @param {string|{message:string, attachments?:Array, templateId?:string}} plaintextOrEnvelope
 */
export async function encryptVaultPayload(plaintextOrEnvelope, title, passphrase) {
  const subtle = assertSubtle();

  let envelope;
  if (typeof plaintextOrEnvelope === "string") {
    if (!plaintextOrEnvelope.length) throw new Error("Message cannot be empty");
    envelope = { version: 1, message: plaintextOrEnvelope, attachments: [] };
  } else if (plaintextOrEnvelope && typeof plaintextOrEnvelope === "object") {
    if (!plaintextOrEnvelope.message || !String(plaintextOrEnvelope.message).length) {
      throw new Error("Message cannot be empty");
    }
    envelope = {
      version: 1,
      message: plaintextOrEnvelope.message,
      templateId: plaintextOrEnvelope.templateId || "custom",
      attachments: plaintextOrEnvelope.attachments || [],
    };
  } else {
    throw new Error("Invalid payload");
  }

  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Title cannot be empty");
  }
  assertPassphrase(passphrase);

  const plaintext = JSON.stringify(envelope);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const payloadIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const titleIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const master = await deriveMasterKey(passphrase, salt);
  let aesKey;
  let hmacKey;
  try {
    ({ aesKey, hmacKey } = await expandKeys(master));
  } finally {
    master.fill(0);
  }

  const encryptedPayloadBuf = await subtle.encrypt(
    { name: "AES-GCM", iv: payloadIv },
    aesKey,
    TEXT_ENCODER.encode(plaintext)
  );
  const encryptedTitleBuf = await subtle.encrypt(
    { name: "AES-GCM", iv: titleIv },
    aesKey,
    TEXT_ENCODER.encode(title.trim())
  );

  const encryptedPayload = new Uint8Array(encryptedPayloadBuf);
  const encryptedTitle = new Uint8Array(encryptedTitleBuf);

  const mac = await hmacSign(
    hmacKey,
    encryptedPayload,
    payloadIv,
    encryptedTitle,
    titleIv,
    salt
  );

  return {
    cryptoVersion: CRYPTO_VERSION,
    kdf: KDF_ID,
    encryptedPayload: toBase64(encryptedPayload),
    encryptedTitle: toBase64(encryptedTitle),
    initVector: toBase64(payloadIv),
    titleIv: toBase64(titleIv),
    salt: toBase64(salt),
    payloadMac: toBase64(mac),
  };
}

/**
 * Verify MAC then decrypt title + payload.
 */
export async function decryptVaultPayload({
  encryptedPayload,
  encryptedTitle,
  initVector,
  titleIv,
  salt,
  payloadMac,
  passphrase,
}) {
  const subtle = assertSubtle();

  if (typeof passphrase !== "string" || !passphrase.length) {
    throw new Error("Passphrase is required");
  }

  try {
    const saltBytes = fromBase64(salt);
    const payloadIv = fromBase64(initVector);
    const titleIvBytes = fromBase64(titleIv);
    const ciphertext = fromBase64(encryptedPayload);
    const titleCipher = fromBase64(encryptedTitle);
    const macBytes = fromBase64(payloadMac);

    const master = await deriveMasterKey(passphrase, saltBytes);
    let aesKey;
    let hmacKey;
    try {
      ({ aesKey, hmacKey } = await expandKeys(master));
    } finally {
      master.fill(0);
    }

    const macOk = await hmacVerify(
      hmacKey,
      macBytes,
      ciphertext,
      payloadIv,
      titleCipher,
      titleIvBytes,
      saltBytes
    );
    if (!macOk) {
      throw new Error(
        "Integrity check failed. Ciphertext may have been tampered with, or the passphrase is wrong."
      );
    }

    const titleBuf = await subtle.decrypt(
      { name: "AES-GCM", iv: titleIvBytes },
      aesKey,
      titleCipher
    );
    const payloadBuf = await subtle.decrypt(
      { name: "AES-GCM", iv: payloadIv },
      aesKey,
      ciphertext
    );

    const raw = TEXT_DECODER.decode(payloadBuf);
    let message = raw;
    let attachments = [];
    let templateId = "custom";
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.message === "string") {
        message = parsed.message;
        attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
        templateId = parsed.templateId || "custom";
      }
    } catch {
      /* legacy plaintext payloads */
    }

    return {
      title: TEXT_DECODER.decode(titleBuf),
      message,
      attachments,
      templateId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Integrity check")) throw err;
    if (
      message.includes("OperationError") ||
      message.toLowerCase().includes("decrypt")
    ) {
      throw new Error("Decryption failed. Check your passphrase and try again.");
    }
    throw new Error(`Decryption failed: ${message}`);
  }
}

/**
 * Cryptographically strong URL-safe token (ping / unlock).
 */
export function generateSecureToken(byteLength = 32) {
  assertSubtle();
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** @deprecated use generateSecureToken */
export function generatePingToken(byteLength = 32) {
  return generateSecureToken(byteLength);
}

/**
 * Build a check-in URL that keeps the token in the hash fragment
 * so it is not sent to servers via Referer or access logs.
 */
export function buildPingUrl(origin, token) {
  const base = `${origin.replace(/\/$/, "")}/ping`;
  return `${base}#token=${encodeURIComponent(token)}`;
}

export function buildUnlockUrl(origin, vaultId, unlockToken) {
  const base = `${origin.replace(/\/$/, "")}/unlock/${encodeURIComponent(vaultId)}`;
  return `${base}#unlock=${encodeURIComponent(unlockToken)}`;
}

export function parseHashParam(key) {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get(key) || "";
}

export function buildDashboardUrl(origin, accessToken) {
  return `${origin.replace(/\/$/, "")}/dashboard#access=${encodeURIComponent(accessToken)}`;
}

/** Split passphrase into two complementary shares (XOR of random mask). */
export function splitPassphrase(passphrase) {
  assertSubtle();
  const bytes = TEXT_ENCODER.encode(passphrase);
  const mask = crypto.getRandomValues(new Uint8Array(bytes.length));
  const shareA = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    shareA[i] = bytes[i] ^ mask[i];
  }
  return {
    shareYou: toBase64(shareA),
    shareThem: toBase64(mask),
  };
}

export function combinePassphraseShares(shareYou, shareThem) {
  const a = fromBase64(shareYou);
  const b = fromBase64(shareThem);
  if (a.length !== b.length) {
    throw new Error("Shares must be the same length");
  }
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] ^ b[i];
  }
  return TEXT_DECODER.decode(out);
}

export function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.onload = () => {
      const buffer = reader.result;
      resolve({
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        data: toBase64(buffer),
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

export function downloadIcsReminder({ title, description, nextPingDue, url }) {
  const dt = new Date(nextPingDue);
  const stamp = dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const uid = `${Date.now()}@cipherswitch`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CipherSwitch//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${stamp}`,
    `SUMMARY:${title || "CipherSwitch check-in"}`,
    `DESCRIPTION:${(description || "Check in to keep your vault sealed.").replace(/\n/g, "\\n")}`,
    url ? `URL:${url}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = "cipherswitch-checkin.ics";
  a.click();
  URL.revokeObjectURL(href);
}
