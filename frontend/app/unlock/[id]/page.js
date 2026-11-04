"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import WidgetSkeleton from "../../../components/WidgetSkeleton";
import {
  combinePassphraseShares,
  decryptVaultPayload,
  parseHashParam,
} from "../../../utils/crypto";
import { apiBase } from "../../../utils/api";

const API_BASE = apiBase(process.env.NEXT_PUBLIC_API_URL);

function downloadName(name) {
  const cleaned = String(name || "attachment")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || "attachment";
}

function downloadHref(data) {
  const cleaned = String(data || "").replace(/[^A-Za-z0-9+/=_-]/g, "");
  return `data:application/octet-stream;base64,${cleaned}`;
}

export default function UnlockPage() {
  const params = useParams();
  const vaultId = params?.id;
  const autoFetched = useRef(false);

  const [phase, setPhase] = useState("awaiting");
  const [unlockToken, setUnlockToken] = useState("");
  const [vault, setVault] = useState(null);
  const [passphrase, setPassphrase] = useState("");
  const [shareA, setShareA] = useState("");
  const [shareB, setShareB] = useState("");
  const [title, setTitle] = useState("");
  const [plaintext, setPlaintext] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadVault = useCallback(
    async (tokenOverride) => {
      const token = (tokenOverride ?? unlockToken).trim();
      if (!vaultId) {
        setPhase("error");
        setError("Missing vault id.");
        return;
      }
      if (token.length < 32) {
        setPhase("error");
        setError("Unlock token required (from your unlock link).");
        return;
      }

      setBusy(true);
      setPhase("loading");
      setError("");
      setVault(null);

      try {
        const response = await fetch(
          `${API_BASE}/api/vaults/payload/${encodeURIComponent(vaultId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unlock_token: token }),
          }
        );
        const data = await response.json().catch(() => ({}));

        if (response.status === 403) {
          const detail =
            typeof data.detail === "string" ? data.detail : "Access denied.";
          if (detail.toLowerCase().includes("active")) {
            setPhase("sealed");
          } else {
            setPhase("error");
          }
          setError(detail);
          return;
        }

        if (!response.ok) {
          throw new Error(
            typeof data.detail === "string"
              ? data.detail
              : "Unable to load vault."
          );
        }

        setVault(data);
        setPhase("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error");
        setPhase("error");
      } finally {
        setBusy(false);
      }
    },
    [unlockToken, vaultId]
  );

  useEffect(() => {
    const fromHash = parseHashParam("unlock");
    const fromQuery =
      new URLSearchParams(window.location.search).get("unlock") || "";
    const initial = fromHash || fromQuery;
    if (initial) {
      setUnlockToken(initial);
      if (fromQuery && !fromHash) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}#unlock=${encodeURIComponent(fromQuery)}`
        );
      }
      if (vaultId && initial.length >= 32 && !autoFetched.current) {
        autoFetched.current = true;
        loadVault(initial);
      }
    }
  }, [vaultId, loadVault]);

  async function handleDecrypt(event) {
    event.preventDefault();
    if (!vault) return;

    setBusy(true);
    setError("");
    setPlaintext("");
    setTitle("");

    try {
      const secret = await decryptVaultPayload({
        encryptedPayload: vault.encrypted_payload,
        encryptedTitle: vault.encrypted_title,
        initVector: vault.init_vector,
        titleIv: vault.title_iv,
        salt: vault.salt,
        payloadMac: vault.payload_mac,
        passphrase,
      });
      setTitle(secret.title);
      setPlaintext(secret.message);
      setAttachments(secret.attachments || []);
      setPhase("unlocked");
      setPassphrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decryption failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-8 sm:py-16">
      <div className="mb-8 animate-fade-up">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky">
          Recipient unlock
        </p>
        <h1 className="mt-3 heading-caps text-3xl text-ink sm:text-4xl">
          Open the vault
        </h1>
        <p className="mt-3 text-ink-soft">
          You&apos;ll need the unlock link and the shared passphrase.
          Decryption happens only in this browser.
        </p>
      </div>

      <div className="panel animate-fade-up-1 p-4 sm:p-8">
        {(phase === "awaiting" || phase === "error") && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadVault();
            }}
            className="space-y-4"
          >
            <div>
              <label className="label" htmlFor="unlock">
                Unlock token
              </label>
              <input
                id="unlock"
                className="field"
                value={unlockToken}
                onChange={(e) => setUnlockToken(e.target.value)}
                placeholder="From the unlock link you were given"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {error ? (
              <div
                role="alert"
                className="rounded-2xl px-4 py-3 text-sm status-err"
              >
                {error}
              </div>
            ) : null}
              <button type="submit" className="btn-primary w-full !min-h-[48px]" disabled={busy}>
                {busy ? "Loading…" : "Fetch sealed message"}
              </button>
          </form>
        )}

        {phase === "loading" && <WidgetSkeleton label="Checking unlock token" />}

        {phase === "sealed" && (
          <div className="space-y-4">
            <div
              role="alert"
              className="rounded-2xl px-4 py-3 text-sm status-err"
            >
              {error}
            </div>
            <p className="text-sm text-ink-faint">
              The owner is still checking in. Come back after the deadline.
            </p>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => loadVault()}
              disabled={busy}
            >
              Try again
            </button>
          </div>
        )}

        {(phase === "ready" || phase === "unlocked") && vault && (
          <>
            <div className="mb-6 space-y-1 text-sm text-ink-soft">
              <p>
                Status:{" "}
                <span className="font-semibold text-clay">{vault.status}</span>
              </p>
              {vault.triggered_at ? (
                <p>Triggered {new Date(vault.triggered_at).toLocaleString()}</p>
              ) : null}
            </div>

            {phase === "ready" && (
              <form onSubmit={handleDecrypt} className="space-y-4">
                <div>
                  <label className="label" htmlFor="pass">
                    Passphrase
                  </label>
                  <input
                    id="pass"
                    type="password"
                    className="field"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoComplete="off"
                    placeholder="Shared passphrase from the vault owner"
                    required
                    disabled={busy}
                  />
                </div>
                <details className="rounded-2xl border border-slate-100 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-ink-soft">
                    Have split shares instead?
                  </summary>
                  <div className="mt-3 space-y-2">
                    <input
                      className="field"
                      placeholder="Share A"
                      value={shareA}
                      onChange={(e) => setShareA(e.target.value)}
                    />
                    <input
                      className="field"
                      placeholder="Share B"
                      value={shareB}
                      onChange={(e) => setShareB(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-ghost !py-2 text-sm"
                      onClick={() => {
                        try {
                          setPassphrase(combinePassphraseShares(shareA, shareB));
                          setError("");
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Could not combine shares"
                          );
                        }
                      }}
                    >
                      Combine into passphrase
                    </button>
                  </div>
                </details>
                {error ? (
                  <div
                    role="alert"
                    className="rounded-2xl px-4 py-3 text-sm status-err"
                  >
                    {error}
                  </div>
                ) : null}
                  <button
                    type="submit"
                    className="btn-primary w-full !min-h-[48px]"
                    disabled={busy || !passphrase}
                  >
                    {busy ? "Decrypting…" : "Decrypt here"}
                  </button>
              </form>
            )}

            {phase === "unlocked" && (
              <div className="animate-scale-in space-y-5">
                <p className="inline-flex rounded-full px-3 py-1 text-sm font-semibold status-ok">
                  Opened on this device
                  {vault.is_dry_run ? " · dry-run" : ""}
                </p>
                <div>
                  <p className="label">Title</p>
                  <p className="heading-caps text-2xl text-ink">{title}</p>
                </div>
                <div className="rounded-2xl bg-sky-mist p-4">
                  <pre className="whitespace-pre-wrap break-words font-sans text-[0.95rem] leading-relaxed text-ink">
                    {plaintext}
                  </pre>
                </div>
                {attachments.length > 0 ? (
                  <div>
                    <p className="label">Attachments</p>
                    <ul className="space-y-2">
                      {attachments.map((file, index) => (
                        <li key={`${downloadName(file.name)}-${index}`}>
                          <a
                            className="text-sm font-semibold text-sky hover:underline"
                            href={downloadHref(file.data)}
                            download={downloadName(file.name)}
                          >
                            Download {downloadName(file.name)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(plaintext);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Copy message
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
