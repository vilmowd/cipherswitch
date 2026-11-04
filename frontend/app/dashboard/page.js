"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DateTimeField from "../../components/DateTimeField";
import FilePicker from "../../components/FilePicker";
import WidgetSkeleton from "../../components/WidgetSkeleton";
import { apiBase } from "../../utils/api";
import { stripeCheckoutUrl } from "../../utils/checkout";
import {
  attachmentLimitError,
  decryptVaultPayload,
  downloadIcsReminder,
  encryptVaultPayload,
  fileToAttachment,
  MAX_MESSAGE_CHARS,
  MAX_TITLE_CHARS,
  parseHashParam,
} from "../../utils/crypto";

const API_BASE = apiBase(process.env.NEXT_PUBLIC_API_URL);

function toIsoOrEmpty(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function readTravelDraft() {
  try {
    const raw = sessionStorage.getItem("cipherswitch-travel");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readEditDraft() {
  try {
    const raw = sessionStorage.getItem("cipherswitch-edit");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function CheckInButton({ vault, now, busy, onCheckIn }) {
  const due = new Date(vault.next_ping_due);
  const dueLabel = due.toLocaleString();
  const graceDays = Number(vault.grace_days) || 0;
  const graceStart = vault.grace_started_at ? new Date(vault.grace_started_at) : due;
  const pressBy = new Date(graceStart.getTime() + graceDays * 86400000);
  const open = vault.status !== "TRIGGERED" && now >= due.getTime();

  if (vault.status === "TRIGGERED") {
    return (
      <button type="button" className="btn-primary checkin-faded w-full !py-2 text-sm sm:w-auto" disabled>
        Released
      </button>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary checkin-faded w-full !py-2 text-sm sm:w-auto" disabled>
        Next deadline {dueLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn-primary w-full !flex-col !py-2 text-sm sm:w-auto"
      onClick={() => onCheckIn(vault.vault_id)}
      disabled={busy}
    >
      Check in
      <span className="text-xs font-medium">
        {graceDays > 0 ? `Before ${pressBy.toLocaleString()}` : "Deadline passed"}
      </span>
    </button>
  );
}

export default function DashboardPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editPass, setEditPass] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [editFiles, setEditFiles] = useState([]);
  const [editReady, setEditReady] = useState(false);
  const [editError, setEditError] = useState("");
  const [travelOpen, setTravelOpen] = useState("");
  const [travelUntil, setTravelUntil] = useState("");
  const [travelDays, setTravelDays] = useState("30");
  const [travelSession, setTravelSession] = useState("");
  const [fileSession, setFileSession] = useState("");

  const load = useCallback(async (access) => {
    const raw = (access || token).trim();
    const fromLink = raw.includes("#")
      ? new URLSearchParams(raw.split("#")[1] || "").get("access")
      : "";
    const t = (fromLink || raw).trim();
    if (t.length < 32) {
      setError("Paste the dashboard code from your seal email.");
      return;
    }
    setBusy(true);
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/vaults/dashboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_access_token: t }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json.detail === "string" ? json.detail : "Unable to load dashboard"
        );
      }
      setData(json);
      setToken(t);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#access=${encodeURIComponent(t)}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setData(null);
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 15000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const travelCanceled = params.get("travel_canceled");
    const editPaid = params.get("edit_paid");
    const editCanceled = params.get("edit_canceled");
    const fromHash = parseHashParam("access");
    const storedTravel = readTravelDraft();
    const storedEdit = readEditDraft();
    const travelPaid = params.get("travel_paid") || storedTravel?.sessionId || "";
    const filePaid = editPaid || storedEdit?.sessionId || "";
    if (fromHash && !travelPaid && !filePaid) {
      setToken(fromHash);
      load(fromHash);
    }
    if (travelCanceled) {
      sessionStorage.removeItem("cipherswitch-travel");
      setNotice("Payment canceled. Travel mode was not turned on.");
    }
    if (travelPaid && !travelCanceled) {
      const pending = storedTravel || {};
      const untilRaw = typeof pending.until === "string" ? pending.until : "";
      const until = toIsoOrEmpty(untilRaw);
      const untilFuture = Boolean(until) && new Date(until).getTime() > Date.now();
      const vaultId = pending.vaultId || params.get("vault") || "";
      const access = pending.token || fromHash || "";
      const days = Number(pending.days);
      sessionStorage.setItem(
        "cipherswitch-travel",
        JSON.stringify({
          vaultId,
          until: untilRaw,
          days: Number.isInteger(days) ? days : pending.days,
          token: access,
          sessionId: travelPaid,
        })
      );
      if (untilRaw) setTravelUntil(untilRaw);
      if (Number.isInteger(days) && days > 0) setTravelDays(String(days));
      if (access) setToken(access);
      const ready = untilFuture && vaultId && access && Number.isInteger(days) && days >= 1;
      if (!ready) {
        (async () => {
          if (access) await load(access);
          setTravelOpen(vaultId);
          setTravelSession(travelPaid);
          setError("Payment received. Choose a travel end date in the future to turn it on. You will not be charged again.");
        })();
      } else {
        setBusy(true);
        (async () => {
          try {
            const res = await fetch(`${API_BASE}/api/vaults/${vaultId}/travel`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                owner_access_token: access,
                travel_until: until,
                travel_interval_days: days,
                checkout_session_id: travelPaid,
              }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              if (res.status === 402) {
                sessionStorage.removeItem("cipherswitch-travel");
                setTravelSession("");
                window.history.replaceState(null, "", `${window.location.pathname}#access=${encodeURIComponent(access)}`);
                await load(access);
                setNotice("Travel mode is already on for this payment.");
                return;
              }
              throw new Error(
                typeof json.detail === "string" ? json.detail : "Travel mode failed"
              );
            }
            sessionStorage.removeItem("cipherswitch-travel");
            setTravelSession("");
            setTravelOpen("");
            window.history.replaceState(null, "", `${window.location.pathname}#access=${encodeURIComponent(access)}`);
            await load(access);
            setNotice(json.message || "Travel mode is on.");
          } catch (err) {
            if (access) await load(access);
            setTravelOpen(vaultId);
            setTravelSession(travelPaid);
            setError(err instanceof Error ? err.message : "Error");
          } finally {
            setBusy(false);
          }
        })();
      }
    }
    if (editCanceled) {
      sessionStorage.removeItem("cipherswitch-edit");
      setNotice("Payment canceled. The vault was not changed.");
    }
    if (filePaid && !editCanceled) {
      const pending = storedEdit || {};
      sessionStorage.setItem(
        "cipherswitch-edit",
        JSON.stringify({ ...pending, sessionId: filePaid })
      );
      setFileSession(filePaid);
      if (!pending.vaultId || !pending.body || !pending.token) {
        if (pending.token || fromHash) setToken(pending.token || fromHash);
        (async () => {
          const access = pending.token || fromHash || "";
          if (access) await load(access);
          setError("Payment received. Open the vault, attach the files again, and save. You will not be charged again.");
        })();
      } else {
        setToken(pending.token);
        setBusy(true);
        (async () => {
          try {
            const res = await fetch(`${API_BASE}/api/vaults/${pending.vaultId}/update`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...pending.body, checkout_session_id: filePaid }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              if (res.status === 402) {
                sessionStorage.removeItem("cipherswitch-edit");
                setFileSession("");
                window.history.replaceState(null, "", `${window.location.pathname}#access=${encodeURIComponent(pending.token)}`);
                await load(pending.token);
                setNotice("Files are already attached for this payment.");
                return;
              }
              throw new Error(
                typeof json.detail === "string" ? json.detail : "Could not update the vault"
              );
            }
            sessionStorage.removeItem("cipherswitch-edit");
            setFileSession("");
            window.history.replaceState(null, "", `${window.location.pathname}#access=${encodeURIComponent(pending.token)}`);
            await load(pending.token);
            setNotice("Files are attached to this vault.");
          } catch (err) {
            if (pending.token) await load(pending.token);
            setError(err instanceof Error ? err.message : "Error");
          } finally {
            setBusy(false);
          }
        })();
      }
    }
    if (travelCanceled || editCanceled) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkIn(vaultId) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/vaults/${vaultId}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_access_token: token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === "string" ? json.detail : "Check-in failed");
      }
      const due = json.next_ping_due ? new Date(json.next_ping_due).toLocaleString() : "";
      await load(token);
      setNotice(due ? `Checked in. Next deadline ${due}.` : "Checked in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
      setLoading(false);
    }
  }

  async function applyTravel(vaultId, sessionId) {
    const until = toIsoOrEmpty(travelUntil);
    const days = Number(travelDays);
    if (!until || new Date(until).getTime() <= Date.now()) {
      setError("Choose a travel end date in the future.");
      return;
    }
    if (!Number.isInteger(days) || days < 1) {
      setError("Enter how many days between check-ins while traveling.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/vaults/${vaultId}/travel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_access_token: token,
          travel_until: until,
          travel_interval_days: days,
          checkout_session_id: sessionId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === "string" ? json.detail : "Travel mode failed");
      }
      sessionStorage.removeItem("cipherswitch-travel");
      setTravelSession("");
      setTravelOpen("");
      setNotice(json.message || "Travel mode enabled");
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function startTravelCheckout(vaultId) {
    const until = toIsoOrEmpty(travelUntil);
    const days = Number(travelDays);
    if (!until || new Date(until).getTime() <= Date.now()) {
      setError("Choose a travel end date in the future.");
      return;
    }
    if (!Number.isInteger(days) || days < 1) {
      setError("Enter how many days between check-ins while traveling.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      sessionStorage.setItem(
        "cipherswitch-travel",
        JSON.stringify({ vaultId, until, days, token })
      );
      const res = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "premium_travel", vault_id: vaultId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        throw new Error(
          typeof json.detail === "string" ? json.detail : "Could not start checkout"
        );
      }
      window.location.assign(stripeCheckoutUrl(json.url));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setBusy(false);
    }
  }

  function closeEditor() {
    setEditingId("");
    setEditPass("");
    setEditTitle("");
    setEditMessage("");
    setEditFiles([]);
    setEditReady(false);
    setEditError("");
  }

  async function decryptForEdit(vaultId) {
    if (!editPass) {
      setEditError("Enter the passphrase to open the sealed message.");
      return;
    }
    setBusy(true);
    setEditError("");
    try {
      const res = await fetch(`${API_BASE}/api/vaults/${vaultId}/contents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_access_token: token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === "string" ? json.detail : "Could not open the vault");
      }
      const plain = await decryptVaultPayload({
        encryptedPayload: json.encrypted_payload,
        encryptedTitle: json.encrypted_title,
        initVector: json.init_vector,
        titleIv: json.title_iv,
        salt: json.salt,
        payloadMac: json.payload_mac,
        passphrase: editPass,
      });
      setEditTitle(plain.title || "");
      setEditMessage(plain.message || "");
      setEditFiles(Array.isArray(plain.attachments) ? plain.attachments : []);
      setEditReady(true);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not open the vault");
    } finally {
      setBusy(false);
    }
  }

  async function addEditFiles(list) {
    const fileError = attachmentLimitError(list, editFiles);
    if (fileError) {
      setEditError(fileError);
      return;
    }
    const next = [...editFiles];
    for (const file of list) {
      next.push(await fileToAttachment(file));
    }
    setEditError("");
    setEditFiles(next);
  }

  async function saveEdit(vault) {
    if (!editTitle.trim() || !editMessage.trim()) {
      setEditError("Title and message are required.");
      return;
    }
    if (editTitle.length > MAX_TITLE_CHARS) {
      setEditError("Title is too long.");
      return;
    }
    if (editMessage.length > MAX_MESSAGE_CHARS) {
      setEditError("Message is too long (20,000 characters).");
      return;
    }
    const fileError = attachmentLimitError([], editFiles);
    if (fileError) {
      setEditError(fileError);
      return;
    }
    if (!editPass) {
      setEditError("Enter the passphrase again to seal the change.");
      return;
    }
    setBusy(true);
    setEditError("");
    try {
      const encrypted = await encryptVaultPayload(
        { message: editMessage, attachments: editFiles, templateId: vault.template_id },
        editTitle,
        editPass
      );
      const body = {
        owner_access_token: token,
        encrypted_title: encrypted.encryptedTitle,
        encrypted_payload: encrypted.encryptedPayload,
        init_vector: encrypted.initVector,
        title_iv: encrypted.titleIv,
        salt: encrypted.salt,
        payload_mac: encrypted.payloadMac,
        has_attachments: editFiles.length > 0,
        release_title: editTitle.trim(),
        release_message: editMessage,
        release_files: editFiles.map((file) => ({ name: file.name, data: file.data })),
      };
      const heldFilePayment = fileSession && readEditDraft()?.vaultId === vault.vault_id ? fileSession : "";
      if (editFiles.length > 0 && !vault.has_attachments && !heldFilePayment) {
        sessionStorage.setItem(
          "cipherswitch-edit",
          JSON.stringify({ vaultId: vault.vault_id, token, body })
        );
        const checkout = await fetch(`${API_BASE}/api/billing/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purpose: "seal_fees",
            owner_email: data?.owner_email,
            recipient_count: 1,
            vault_id: vault.vault_id,
            has_attachments: true,
            include_extra_vault: false,
            return_to: "edit",
          }),
        });
        const json = await checkout.json().catch(() => ({}));
        if (!checkout.ok || !json.url) {
          sessionStorage.removeItem("cipherswitch-edit");
          throw new Error(typeof json.detail === "string" ? json.detail : "Could not start checkout");
        }
        setEditPass("");
        window.location.assign(stripeCheckoutUrl(json.url));
        return;
      }
      const res = await fetch(`${API_BASE}/api/vaults/${vault.vault_id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          checkout_session_id: heldFilePayment || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === "string" ? json.detail : "Could not update the vault");
      }
      const attachedFiles = body.has_attachments && !vault.has_attachments;
      sessionStorage.removeItem("cipherswitch-edit");
      setFileSession("");
      setEditPass("");
      closeEditor();
      await load(token);
      setNotice(attachedFiles ? "Files are attached to this vault." : (json.message || "Vault updated."));
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error");
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const id = deleteId;
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/vaults/${id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_access_token: token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === "string" ? json.detail : "Could not delete the vault");
      }
      setDeleteId("");
      if (editingId === id) closeEditor();
      setData((current) =>
        current
          ? { ...current, vaults: current.vaults.filter((item) => item.vault_id !== id) }
          : current
      );
      setNotice("Vault deleted. This cannot be restored.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function dryRunTrigger(vaultId) {
    if (!confirm("Force-trigger this dry-run vault?")) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/vaults/${vaultId}/dry-run-trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_access_token: token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "Dry-run trigger failed");
      setNotice(json.message || "Triggered");
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-16">
      <div className="mb-8 animate-fade-up">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky">
          Owner dashboard
        </p>
        <h1 className="mt-3 heading-caps text-3xl text-ink sm:text-4xl">Your vaults</h1>
        <p className="mt-3 max-w-xl text-ink-soft">
          Metadata only — we never show titles or messages here.
        </p>
      </div>

      {!data ? (
        loading ? (
          <WidgetSkeleton label="Loading your vaults" />
        ) : (
        <form
          className="panel animate-fade-up-1 space-y-4 p-4 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <div>
            <label className="label" htmlFor="access">Dashboard access token</label>
            <input
              id="access"
              className="field"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Code from your seal email"
            />
          </div>
          {error ? (
            <div className="rounded-2xl px-4 py-3 text-sm status-err">{error}</div>
          ) : null}
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>
            Open dashboard
          </button>
        </form>
        )
      ) : (
        <div className="space-y-6 animate-fade-up-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              Signed in as <strong>{data.owner_email}</strong> · {data.vaults.length}{" "}
              {data.vaults.length === 1 ? "vault" : "vaults"}
            </p>
            <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => load(token)}>
              Refresh
            </button>
          </div>

          {notice ? (
            <div className="rounded-2xl px-4 py-3 text-sm status-ok">{notice}</div>
          ) : null}
          {error ? (
            <div className="rounded-2xl px-4 py-3 text-sm status-err">{error}</div>
          ) : null}

          {loading ? (
            data.vaults.map((v) => <WidgetSkeleton key={v.vault_id} label="Loading vault" />)
          ) : data.vaults.map((v) => (
            <article
              key={v.vault_id}
              className={`panel relative overflow-hidden p-4 sm:p-6 ${
                v.status === "TRIGGERED" ? "" : "card-hover"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-ink-faint">{v.vault_id}</p>
                  <p className="mt-1 heading-caps text-xl text-ink">
                    {v.template_id.replace(/-/g, " ")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    v.status === "ACTIVE"
                      ? "status-ok"
                      : v.status === "GRACE"
                        ? "status-warn"
                        : "status-err"
                  }`}
                >
                  {v.status}
                </span>
              </div>

              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-faint">Days sealed</dt>
                  <dd className="font-semibold text-ink">{v.days_sealed}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Interval / grace</dt>
                  <dd className="font-semibold text-ink">
                    {v.interval_days}d / {v.grace_days}d
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Next check-in</dt>
                  <dd className="font-semibold text-ink">
                    {new Date(v.next_ping_due).toLocaleString()}
                    {v.travel_until && new Date(v.travel_until).getTime() > now ? (
                      <span className="mt-1 block text-xs font-medium text-ink-soft">Using the travel interval</span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Flags</dt>
                  <dd className="font-semibold text-ink">
                    {[
                      v.is_dry_run ? "dry-run" : null,
                      v.has_attachments ? "attachments" : null,
                      v.travel_until ? "travel" : null,
                      v.release_at ? "time-lock" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </dd>
                </div>
                {v.travel_until ? (
                  <div>
                    <dt className="text-ink-faint">Travel until</dt>
                    <dd className="font-semibold text-ink">{new Date(v.travel_until).toLocaleString()}</dd>
                  </div>
                ) : null}
                {v.travel_until && v.travel_interval_days ? (
                  <div>
                    <dt className="text-ink-faint">Check-in while traveling</dt>
                    <dd className="font-semibold text-ink">Every {v.travel_interval_days} days</dd>
                  </div>
                ) : null}
                {v.release_at ? (
                  <div>
                    <dt className="text-ink-faint">Time-lock</dt>
                    <dd className="font-semibold text-ink">Releases {new Date(v.release_at).toLocaleString()}</dd>
                  </div>
                ) : null}
                {v.has_attachments ? (
                  <div>
                    <dt className="text-ink-faint">Files</dt>
                    <dd className="font-semibold text-ink">Attached</dd>
                  </div>
                ) : null}
                {v.recipients.length > 1 ? (
                  <div>
                    <dt className="text-ink-faint">Extra recipients</dt>
                    <dd className="font-semibold text-ink">{v.recipients.length} people</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                  Recipients
                </p>
                <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                  {v.recipients.map((r) => (
                    <li key={`${r.email}-${r.role}`}>
                      {r.email} · {r.role}
                      {r.release_delay_days
                        ? ` · +${r.release_delay_days}d delay`
                        : ""}
                      {r.can_unlock ? "" : " · no unlock"}
                    </li>
                  ))}
                </ul>
              </div>

              {v.status === "TRIGGERED" ? null : (
              <>
              <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <CheckInButton vault={v} now={now} busy={busy} onCheckIn={checkIn} />
                <button
                  type="button"
                  className="btn-ghost w-full !py-2 text-sm sm:w-auto"
                  onClick={() => {
                    try {
                      downloadIcsReminder({
                        title: `CipherSwitch check-in`,
                        description: `Vault ${v.vault_id}`,
                        nextPingDue: v.next_ping_due,
                        url: `${window.location.origin}/ping`,
                      });
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not make the calendar file.");
                    }
                  }}
                >
                  Calendar .ics
                </button>
                {v.status !== "TRIGGERED" && v.travel_until && new Date(v.travel_until).getTime() > now ? (
                  <p className="inline-flex items-center rounded-full bg-sky/10 px-3 py-2 text-sm font-semibold text-ink">
                    Travel on until {new Date(v.travel_until).toLocaleString()}
                  </p>
                ) : v.status !== "TRIGGERED" ? (
                  <button
                    type="button"
                    className="btn-ghost w-full !py-2 text-sm sm:w-auto"
                    onClick={() => {
                      setTravelOpen(v.vault_id);
                      if (!travelSession) setError("");
                    }}
                    disabled={busy}
                  >
                    {travelSession && travelOpen === v.vault_id ? "Finish travel setup" : "Travel mode · $5 once"}
                  </button>
                ) : null}
                {v.is_dry_run && v.status !== "TRIGGERED" ? (
                  <button
                    type="button"
                    className="btn-ghost w-full !py-2 text-sm sm:w-auto"
                    onClick={() => dryRunTrigger(v.vault_id)}
                    disabled={busy}
                  >
                    Dry-run trigger
                  </button>
                ) : null}
                {v.status !== "TRIGGERED" ? (
                  <button
                    type="button"
                    className="btn-ghost w-full !py-2 text-sm sm:w-auto"
                    onClick={() => {
                      closeEditor();
                      setEditingId(v.vault_id);
                    }}
                    disabled={busy}
                  >
                    Edit message
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost w-full !py-2 text-sm sm:w-auto"
                  onClick={() => setDeleteId(v.vault_id)}
                  disabled={busy}
                >
                  Delete vault
                </button>
              </div>

              {travelOpen === v.vault_id && !(v.travel_until && new Date(v.travel_until).getTime() > now) ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`travel-until-${v.vault_id}`}>Travel until</label>
                    <DateTimeField
                      id={`travel-until-${v.vault_id}`}
                      value={travelUntil}
                      onChange={setTravelUntil}
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`travel-days-${v.vault_id}`}>Check-in interval days</label>
                    <input
                      id={`travel-days-${v.vault_id}`}
                      type="number"
                      min={1}
                      className="field"
                      value={travelDays}
                      onChange={(e) => setTravelDays(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-primary w-full !py-2 text-sm sm:w-auto"
                    disabled={busy}
                    onClick={() => (
                      travelSession
                        ? applyTravel(v.vault_id, travelSession)
                        : startTravelCheckout(v.vault_id)
                    )}
                  >
                    {travelSession ? "Turn on travel mode" : "Pay $5 and turn on"}
                  </button>
                </div>
              ) : null}

              {editingId === v.vault_id ? (
                <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
                  <p className="text-sm text-ink-soft">
                    The message and files stay encrypted in this browser. The server only receives the new seal.
                  </p>
                  <div>
                    <label className="label" htmlFor={`edit-pass-${v.vault_id}`}>Passphrase</label>
                    <input
                      id={`edit-pass-${v.vault_id}`}
                      type="password"
                      className="field"
                      value={editPass}
                      onChange={(e) => setEditPass(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  {!editReady ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary !py-2 text-sm"
                        onClick={() => decryptForEdit(v.vault_id)}
                        disabled={busy}
                      >
                        Open sealed contents
                      </button>
                      <button type="button" className="btn-ghost !py-2 text-sm" onClick={closeEditor}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="label" htmlFor={`edit-title-${v.vault_id}`}>Title</label>
                        <input
                          id={`edit-title-${v.vault_id}`}
                          className="field"
                          value={editTitle}
                          maxLength={MAX_TITLE_CHARS}
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`edit-message-${v.vault_id}`}>Message</label>
                        <textarea
                          id={`edit-message-${v.vault_id}`}
                          className="field min-h-32"
                          value={editMessage}
                          maxLength={MAX_MESSAGE_CHARS}
                          onChange={(e) => setEditMessage(e.target.value)}
                        />
                      </div>
                      <div>
                        <p className="label">Files</p>
                        <ul className="space-y-1 text-sm text-ink-soft">
                          {editFiles.map((file, index) => (
                            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3">
                              <span>{file.name}</span>
                              <button
                                type="button"
                                className="text-sm font-semibold text-sky"
                                onClick={() => setEditFiles((current) => current.filter((_, i) => i !== index))}
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                        <FilePicker
                          id={`edit-files-${v.vault_id}`}
                          disabled={busy}
                          showNames={false}
                          onChange={(e) => {
                            const list = Array.from(e.target.files || []);
                            e.target.value = "";
                            addEditFiles(list);
                          }}
                        />
                        <p className="mt-2 text-xs text-ink-faint">
                          Only .zip and .rar files. Up to 3 files, 1.5 MB each, 3 MB combined.
                        </p>
                        {!v.has_attachments && editFiles.length > 0 ? (
                          <p className="mt-2 text-sm text-ink-soft">
                            {fileSession && readEditDraft()?.vaultId === v.vault_id
                              ? "The $3 file payment is already held. Save to attach these files."
                              : "This vault has no files yet. Adding one is $3, paid once."}
                          </p>
                        ) : v.has_attachments ? (
                          <p className="mt-2 text-sm text-ink-soft">Files are already attached. Replacing them does not add another charge.</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-primary !py-2 text-sm"
                          onClick={() => saveEdit(v)}
                          disabled={busy}
                        >
                          {editFiles.length > 0 && !v.has_attachments && !(fileSession && readEditDraft()?.vaultId === v.vault_id)
                            ? "Pay $3 and save"
                            : "Save seal"}
                        </button>
                        <button type="button" className="btn-ghost !py-2 text-sm" onClick={closeEditor}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                  {editError ? (
                    <div role="alert" className="rounded-2xl px-4 py-3 text-sm status-err">{editError}</div>
                  ) : null}
                </div>
              ) : null}
              </>
              )}
              {v.status === "TRIGGERED" ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white/70 px-6 text-center backdrop-blur-md">
                  <p className="heading-caps text-2xl text-ink">Vault activated</p>
                  <button
                    type="button"
                    className="btn-primary !py-2 text-sm"
                    onClick={() => setDeleteId(v.vault_id)}
                    disabled={busy}
                  >
                    Delete vault
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {data.vaults.length === 0 ? (
            <p className="text-sm text-ink-soft">No vaults left on this code.</p>
          ) : null}
          {deleteId && typeof document !== "undefined"
            ? createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" role="presentation">
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-vault-title"
                    className="panel w-full max-w-md space-y-4 p-6"
                  >
                    <h2 id="delete-vault-title" className="text-2xl font-extrabold text-ink">
                      Delete this vault?
                    </h2>
                    <p className="text-sm leading-relaxed text-ink-soft">
                      This cannot be undone. The sealed message and files are removed, and check-ins stop. CipherSwitch cannot restore them.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => setDeleteId("")} disabled={busy}>
                        Keep vault
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        onClick={confirmDelete}
                        disabled={busy}
                      >
                        Delete vault
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )
            : null}
        </div>
      )}
    </div>
  );
}
