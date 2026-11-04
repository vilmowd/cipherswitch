"use client";

import { useEffect, useMemo, useState } from "react";
import { VAULT_TEMPLATES } from "../templates";
import DateTimeField from "../../components/DateTimeField";
import FilePicker from "../../components/FilePicker";
import WidgetSkeleton from "../../components/WidgetSkeleton";
import { apiBase } from "../../utils/api";
import { stripeCheckoutUrl } from "../../utils/checkout";
import {
  buildDashboardUrl,
  buildPingUrl,
  buildUnlockUrl,
  downloadIcsReminder,
  attachmentLimitError,
  encryptVaultPayload,
  fileToAttachment,
  MAX_MESSAGE_CHARS,
  MAX_TITLE_CHARS,
  generateSecureToken,
  scorePassphrase,
  splitPassphrase,
} from "../../utils/crypto";

const API_BASE = apiBase(process.env.NEXT_PUBLIC_API_URL);
const DRAFT_KEY = "cipherswitch-seal-draft";

const emptyRecipient = (role = "primary") => ({
  email: "",
  role,
  release_delay_days: 0,
  unlock_token: "",
});

export default function CreateVaultPage() {
  const [templateId, setTemplateId] = useState("last-letter");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState(
    VAULT_TEMPLATES.find((t) => t.id === "last-letter")?.placeholder || ""
  );
  const [passphrase, setPassphrase] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [intervalDays, setIntervalDays] = useState(14);
  const [graceDays, setGraceDays] = useState(2);
  const [releaseAt, setReleaseAt] = useState("");
  const [travelUntil, setTravelUntil] = useState("");
  const [travelIntervalDays, setTravelIntervalDays] = useState(30);
  const [isDryRun, setIsDryRun] = useState(false);
  const [recipients, setRecipients] = useState([emptyRecipient()]);

  useEffect(() => {
    setRecipients((current) =>
      current.map((r) =>
        r.role === "witness" || r.unlock_token
          ? r
          : { ...r, unlock_token: generateSecureToken(32) }
      )
    );
  }, []);
  const [files, setFiles] = useState([]);
  const [splitShares, setSplitShares] = useState(null);
  const [step, setStep] = useState("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [pingToken, setPingToken] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [checkoutSessionId, setCheckoutSessionId] = useState("");
  const [feeCents, setFeeCents] = useState({
    recipients: 300,
    files: 300,
    time_lock: 200,
    travel: 500,
    extra_vault: 1200,
  });
  const [extraLabel, setExtraLabel] = useState("$12");
  const [extraVault, setExtraVault] = useState(false);
  const [paidNote, setPaidNote] = useState(false);

  const strength = useMemo(() => scorePassphrase(passphrase), [passphrase]);
  const busy = step === "encrypting" || step === "uploading";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    const canceled = params.get("canceled");
    if (paid || canceled) {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        try {
          const draft = JSON.parse(raw);
          if (draft.templateId) setTemplateId(draft.templateId);
          if (typeof draft.title === "string") setTitle(draft.title);
          if (typeof draft.message === "string") setMessage(draft.message);
          if (typeof draft.ownerEmail === "string") setOwnerEmail(draft.ownerEmail);
          if (draft.intervalDays) setIntervalDays(draft.intervalDays);
          if (draft.graceDays !== undefined) setGraceDays(draft.graceDays);
          if (typeof draft.releaseAt === "string") setReleaseAt(draft.releaseAt);
          if (typeof draft.travelUntil === "string") setTravelUntil(draft.travelUntil);
          if (draft.travelIntervalDays) setTravelIntervalDays(draft.travelIntervalDays);
          if (typeof draft.isDryRun === "boolean") setIsDryRun(draft.isDryRun);
          if (Array.isArray(draft.recipients) && draft.recipients.length) {
            setRecipients(
              draft.recipients.map((r) => ({
                ...emptyRecipient(r.role || "primary"),
                email: r.email || "",
                role: r.role || "primary",
                release_delay_days: r.release_delay_days || 0,
                unlock_token:
                  r.role === "witness" ? "" : generateSecureToken(32),
              }))
            );
          }
        } catch {
          /* ignore a broken draft */
        }
      }
      if (paid) {
        setCheckoutSessionId(paid);
        setPaidNote(true);
      }
      if (canceled) {
        setError("Payment canceled. The vault was not sealed.");
      }
      window.history.replaceState(null, "", "/create");
    }
    fetch(`${API_BASE}/api/billing`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.extra_label) setExtraLabel(data.extra_label);
        if (data?.fees) {
          setFeeCents({
            recipients: data.fees.recipients?.cents ?? 300,
            files: data.fees.files?.cents ?? 300,
            time_lock: data.fees.time_lock?.cents ?? 200,
            travel: data.fees.travel?.cents ?? 500,
            extra_vault: data.fees.extra_vault?.cents ?? 1200,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = VAULT_TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    const placeholders = VAULT_TEMPLATES.map((item) => item.placeholder || "");
    setMessage((current) =>
      !current || placeholders.includes(current) ? t.placeholder || "" : current
    );
    setTitle((current) => current || t.name);
    setIntervalDays((current) => current || t.suggested_interval_days);
  }, [templateId]);

  useEffect(() => {
    const email = ownerEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setExtraVault(false);
      return undefined;
    }
    const handle = setTimeout(() => {
      fetch(`${API_BASE}/api/billing/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_email: email }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setExtraVault(Boolean(data.extra_vault));
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(handle);
  }, [ownerEmail]);

  function updateRecipient(index, patch) {
    setRecipients((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  function validate() {
    if (!title.trim()) return "Add a title.";
    if (title.length > MAX_TITLE_CHARS) return "Title is too long.";
    if (!message.trim()) return "Message cannot be empty.";
    if (message.length > MAX_MESSAGE_CHARS) return "Message is too long (20,000 characters).";
    const fileError = attachmentLimitError(files);
    if (fileError) return fileError;
    if (!strength.ok) return "Passphrase too weak (14+ mixed characters).";
    if (passphrase !== confirmPass) return "Passphrases do not match.";
    if (!ownerEmail.includes("@")) return "Valid owner email required.";
    if (!recipients.length) return "Add at least one recipient.";
    for (const r of recipients) {
      if (!r.email.includes("@")) return "Every recipient needs a valid email.";
      if ((r.role === "primary" || r.role === "backup") && !r.unlock_token) {
        return "Unlockable recipients need tokens.";
      }
    }
    if (!recipients.some((r) => r.role === "primary" || r.role === "backup")) {
      return "Need at least one primary or backup recipient.";
    }
    return null;
  }

  function money(cents) {
    return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
  }

  const selectedFees = [];
  if (extraVault) selectedFees.push({ name: "Another vault", cents: feeCents.extra_vault });
  if (recipients.length > 1) selectedFees.push({ name: "Extra recipients", cents: feeCents.recipients });
  if (files.length) selectedFees.push({ name: "Encrypted files", cents: feeCents.files });
  if (releaseAt) selectedFees.push({ name: "Time-lock", cents: feeCents.time_lock });
  if (travelUntil) selectedFees.push({ name: "Travel mode", cents: feeCents.travel });
  const totalCents = selectedFees.reduce((sum, fee) => sum + fee.cents, 0);
  const payLabel = money(totalCents);
  const needsPayment = totalCents > 0 && !checkoutSessionId;

  function saveDraft() {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        templateId,
        title,
        message,
        ownerEmail,
        intervalDays,
        graceDays,
        releaseAt,
        travelUntil,
        travelIntervalDays,
        isDryRun,
        recipients: recipients.map((r) => ({
          email: r.email,
          role: r.role,
          release_delay_days: r.release_delay_days,
        })),
      })
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const v = validate();
    if (v) {
      setError(v);
      setStep("error");
      return;
    }

    try {
      let anotherVault = extraVault;
      if (ownerEmail.includes("@")) {
        const quote = await fetch(`${API_BASE}/api/billing/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner_email: ownerEmail.trim().toLowerCase() }),
        });
        const quoteData = await quote.json().catch(() => ({}));
        if (quote.ok) {
          anotherVault = Boolean(quoteData.extra_vault);
          setExtraVault(anotherVault);
        }
      }
      const due = [];
      if (anotherVault) due.push(feeCents.extra_vault);
      if (recipients.length > 1) due.push(feeCents.recipients);
      if (files.length) due.push(feeCents.files);
      if (releaseAt) due.push(feeCents.time_lock);
      if (travelUntil) due.push(feeCents.travel);
      if (due.length > 0 && !checkoutSessionId) {
        saveDraft();
        setStep("uploading");
        const checkout = await fetch(`${API_BASE}/api/billing/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purpose: "seal_fees",
            owner_email: ownerEmail.trim().toLowerCase(),
            recipient_count: recipients.length,
            has_attachments: files.length > 0,
            has_time_lock: Boolean(releaseAt),
            has_travel: Boolean(travelUntil),
          }),
        });
        const checkoutData = await checkout.json().catch(() => ({}));
        if (!checkout.ok || !checkoutData.url) {
          throw new Error(
            typeof checkoutData.detail === "string"
              ? checkoutData.detail
              : "Could not start checkout"
          );
        }
        window.location.assign(stripeCheckoutUrl(checkoutData.url));
        return;
      }

      setStep("encrypting");
      const fileError = attachmentLimitError(files);
      if (fileError) throw new Error(fileError);
      const attachments = [];
      for (const f of files) {
        attachments.push(await fileToAttachment(f));
      }

      const nextPing = generateSecureToken(32);
      const preparedRecipients = recipients.map((r) => ({
        email: r.email.trim(),
        role: r.role,
        release_delay_days: Number(r.release_delay_days) || 0,
        unlock_token:
          r.role === "witness" ? undefined : r.unlock_token || generateSecureToken(32),
      }));

      const encrypted = await encryptVaultPayload(
        { message, attachments, templateId },
        title,
        passphrase
      );

      const asIso = (value, label) => {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error(`The ${label} date could not be read.`);
        }
        return parsed.toISOString();
      };

      setStep("uploading");
      const response = await fetch(`${API_BASE}/api/vaults/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encrypted_title: encrypted.encryptedTitle,
          encrypted_payload: encrypted.encryptedPayload,
          init_vector: encrypted.initVector,
          title_iv: encrypted.titleIv,
          salt: encrypted.salt,
          payload_mac: encrypted.payloadMac,
          kdf: encrypted.kdf,
          crypto_version: encrypted.cryptoVersion,
          template_id: templateId,
          interval_days: Number(intervalDays),
          grace_days: Number(graceDays),
          owner_email: ownerEmail.trim(),
          ping_token: nextPing,
          recipients: preparedRecipients,
          release_at: releaseAt ? asIso(releaseAt, "time-lock") : null,
          travel_until: travelUntil ? asIso(travelUntil, "travel") : null,
          travel_interval_days: travelUntil ? Number(travelIntervalDays) : null,
          is_dry_run: isDryRun,
          has_attachments: attachments.length > 0,
          release_title: title.trim(),
          release_message: message,
          release_files: attachments.map((file) => ({ name: file.name, data: file.data })),
          checkout_session_id: checkoutSessionId || null,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 402) setCheckoutSessionId("");
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
              : "Create failed";
        throw new Error(detail);
      }

      sessionStorage.removeItem(DRAFT_KEY);
      setPingToken(nextPing);
      setResult({ ...data, recipients: preparedRecipients });
      setSplitShares(splitPassphrase(passphrase));
      setStep("done");
      setPassphrase("");
      setConfirmPass("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setStep("error");
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pingUrl = pingToken ? buildPingUrl(origin, pingToken) : "";
  const dashUrl =
    result?.owner_access_token
      ? buildDashboardUrl(origin, result.owner_access_token)
      : "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-16">
      <div className="mb-8 animate-fade-up sm:mb-10">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky">
          New vault
        </p>
        <h1 className="mt-3 heading-caps text-3xl text-ink sm:text-5xl">
          Seal a vault
        </h1>
        <p className="mt-3 max-w-xl text-ink-soft">
          Recipients are not emailed until the vault triggers. Attachments must
          be .zip or .rar files.
        </p>
      </div>

      {step === "done" && result ? (
        <div className="panel animate-scale-in space-y-6 p-4 sm:p-8">
          <p className="inline-flex rounded-full px-3 py-1 text-sm font-semibold status-ok">
            {result.is_dry_run || isDryRun ? "Dry-run sealed" : "Vault sealed"}
          </p>
          <p className="text-ink-soft">{result.message}</p>

          <div className="space-y-3 text-sm">
            <p>
              <span className="text-ink-faint">Vault ID · </span>
              <span className="font-mono">{result.vault_id}</span>
            </p>
            <p>
              <span className="text-ink-faint">Next check-in · </span>
              {new Date(result.next_ping_due).toLocaleString()}
            </p>
          </div>

          <div>
            <p className="label">Dashboard code</p>
            <p className="mb-2 text-sm text-ink-soft">
              This code was emailed to you. Your email address does not open the dashboard.
            </p>
            <p className="break-anywhere rounded-2xl bg-sky-mist p-3 font-mono text-xs text-ink">
              {result.owner_access_token}
            </p>
            <p className="mt-2 break-anywhere rounded-2xl bg-sky-mist p-3 font-mono text-xs text-sky-deep">
              {dashUrl}
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a href={dashUrl} className="btn-primary w-full !py-2 text-sm sm:w-auto">
                Open dashboard
              </a>
              <button
                type="button"
                className="btn-ghost w-full !py-2 text-sm sm:w-auto"
                onClick={() => navigator.clipboard.writeText(result.owner_access_token)}
              >
                Copy code
              </button>
            </div>
          </div>

          <div>
            <p className="label">Check-in link</p>
            <p className="break-anywhere rounded-2xl bg-sky-mist p-3 font-mono text-xs text-sky-deep">
              {pingUrl}
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className="btn-ghost w-full !py-2 text-sm sm:w-auto"
                onClick={() =>
                  downloadIcsReminder({
                    title: `CipherSwitch check-in: ${title}`,
                    description: "Keep your vault sealed — check in before the deadline.",
                    nextPingDue: result.next_ping_due,
                    url: pingUrl,
                  })
                }
              >
                Add to calendar (.ics)
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <p className="label">Recipient unlock links</p>
            <p className="text-sm text-ink-soft">
              These links are not emailed. When the vault triggers, each recipient is emailed the message and the archive files.
            </p>
            {(result.recipients || [])
              .filter((r) => r.role !== "witness")
              .map((r) => {
                const url = buildUnlockUrl(origin, result.vault_id, r.unlock_token);
                return (
                  <div key={r.email} className="rounded-2xl border border-slate-100 p-3">
                    <p className="text-sm font-semibold">
                      {r.email} · {r.role}
                    </p>
                    <p className="mt-1 break-anywhere font-mono text-xs text-sky-deep">{url}</p>
                  </div>
                );
              })}
          </div>

          {splitShares ? (
            <div className="rounded-2xl bg-sun-mist p-4 text-sm text-sun">
              <p className="font-bold">Optional passphrase split</p>
              <p className="mt-1">
                Keep share A; give share B to your recipient on a separate channel.
                Both are required to rebuild the passphrase.
              </p>
              <p className="mt-3 break-anywhere font-mono text-xs">A: {splitShares.shareYou}</p>
              <p className="mt-2 break-anywhere font-mono text-xs">B: {splitShares.shareThem}</p>
            </div>
          ) : null}

          <a href="/" className="btn-ghost inline-flex">
            Home
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="panel animate-fade-up-1 space-y-7 p-4 sm:p-8" aria-busy={step === "encrypting" || step === "uploading"}>
          {step === "encrypting" || step === "uploading" ? (
            <div className="absolute inset-0 z-10 rounded-xl bg-white p-4 sm:p-8">
              <WidgetSkeleton label={step === "encrypting" ? "Encrypting your vault" : "Saving your vault"} />
            </div>
          ) : null}
          <div>
            <p className="label">Template</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {VAULT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    templateId === t.id
                      ? "border-sky bg-sky-soft shadow-soft"
                      : "border-slate-100 hover:border-sky/40"
                  }`}
                >
                  <p className="font-bold text-ink">{t.name}</p>
                  <p className="mt-1 text-xs text-ink-faint">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE_CHARS} disabled={busy} />
          </div>

          <div>
            <label className="label" htmlFor="message">Message</label>
            <textarea id="message" className="field min-h-[140px]" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MAX_MESSAGE_CHARS} disabled={busy} />
          </div>

          <div>
            <label className="label" htmlFor="files">Attachments (encrypted) · {money(feeCents.files)} once</label>
            <p className="mb-2 text-sm text-ink-soft" id="file-limit">
              Only .zip and .rar files. Maximum file size is 1.5 MB. You can add up to 3 files, 3 MB combined.
            </p>
            <FilePicker
              id="files"
              describedBy="file-limit"
              disabled={busy}
              files={files}
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pass">Passphrase</label>
              <input id="pass" type={showPass ? "text" : "password"} className="field" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} disabled={busy} />
              <p className="mt-1 text-xs text-ink-faint">Strength: {strength.label}</p>
            </div>
            <div>
              <label className="label" htmlFor="confirm">Confirm</label>
              <input id="confirm" type={showPass ? "text" : "password"} className="field" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} disabled={busy} />
              <button type="button" className="mt-2 text-xs font-bold text-sky" onClick={() => setShowPass((s) => !s)}>
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="owner">Your email</label>
            <input id="owner" type="email" className="field" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} disabled={busy} />
            {extraVault ? (
              <p className="mt-2 text-sm text-ink-soft">
                This email already has an active vault. Another one is {extraLabel}, paid once. Deleting that vault makes the next one free again.
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="label !mb-0">Recipients · extra people are {money(feeCents.recipients)} once</p>
              <button
                type="button"
                className="text-xs font-bold text-sky"
                onClick={() =>
                  setRecipients((r) => [
                    ...r,
                    {
                      ...emptyRecipient("backup"),
                      unlock_token: generateSecureToken(32),
                    },
                  ])
                }
              >
                + Add
              </button>
            </div>
            <div className="space-y-3">
              {recipients.map((r, i) => (
                <div key={i} className="grid gap-2 rounded-2xl border border-slate-100 p-3 sm:grid-cols-3">
                  <input
                    className="field"
                    placeholder="email"
                    value={r.email}
                    onChange={(e) => updateRecipient(i, { email: e.target.value })}
                    disabled={busy}
                  />
                  <select
                    className="field"
                    value={r.role}
                    onChange={(e) =>
                      updateRecipient(i, {
                        role: e.target.value,
                        unlock_token:
                          e.target.value === "witness"
                            ? undefined
                            : r.unlock_token || generateSecureToken(32),
                      })
                    }
                    disabled={busy}
                  >
                    <option value="primary">Primary</option>
                    <option value="backup">Backup</option>
                    <option value="witness">Witness (notify only)</option>
                  </select>
                  <input
                    className="field"
                    type="number"
                    min={0}
                    title="Release delay days"
                    placeholder="Delay days"
                    value={r.release_delay_days}
                    onChange={(e) =>
                      updateRecipient(i, { release_delay_days: e.target.value })
                    }
                    disabled={busy || r.role === "witness"}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
            <div>
              <label className="label sm:min-h-10" htmlFor="interval">Interval (days)</label>
              <input id="interval" type="number" min={1} className="field" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="label sm:min-h-10" htmlFor="grace">Grace (days)</label>
              <input id="grace" type="number" min={0} className="field" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="label sm:min-h-10" htmlFor="release">Time-lock (optional) · {money(feeCents.time_lock)} once</label>
              <DateTimeField id="release" value={releaseAt} onChange={setReleaseAt} disabled={busy} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="travel">Travel until (optional) · {money(feeCents.travel)} once</label>
              <DateTimeField id="travel" value={travelUntil} onChange={setTravelUntil} disabled={busy} />
            </div>
            <div>
              <label className="label" htmlFor="travelInt">Travel interval days</label>
              <input id="travelInt" type="number" min={1} className="field" value={travelIntervalDays} onChange={(e) => setTravelIntervalDays(e.target.value)} disabled={busy || !travelUntil} />
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={isDryRun}
              onChange={(e) => setIsDryRun(e.target.checked)}
              disabled={busy}
            />
            Dry-run mode — safe to force-trigger from the dashboard for testing
          </label>

          {needsPayment ? (
            <p className="text-sm text-ink-soft">
              This seal adds {selectedFees.map((fee) => `${fee.name} (${money(fee.cents)})`).join(", ")}. One payment of {payLabel} covers this vault only. Each of these is charged again the next time you use it. Files and the passphrase are not kept through checkout, so attach the files again and re-enter the passphrase after you pay.
            </p>
          ) : null}
          {paidNote && checkoutSessionId ? (
            <p className="text-sm text-ink">
              Payment received for this seal. Re-enter the passphrase, attach any files again, then seal.
            </p>
          ) : null}

          {error ? (
            <div role="alert" className="rounded-2xl px-4 py-3 text-sm status-err">
              {error}
            </div>
          ) : null}

          {busy ? (
            <div className="rounded-2xl px-4 py-3 text-sm status-warn">
              {step === "encrypting" ? "Encrypting locally…" : "Saving ciphertext…"}
            </div>
          ) : null}

          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>
            {busy ? "Working…" : needsPayment ? `Pay ${payLabel} and seal` : "Encrypt & seal"}
          </button>
        </form>
      )}
    </div>
  );
}
