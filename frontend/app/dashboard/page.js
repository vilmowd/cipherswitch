"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  decryptVaultPayload,
  downloadIcsReminder,
  encryptVaultPayload,
  fileToAttachment,
  parseHashParam,
} from "../../utils/crypto";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function DashboardPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editPass, setEditPass] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [editFiles, setEditFiles] = useState([]);
  const [editReady, setEditReady] = useState(false);
  const [editError, setEditError] = useState("");

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
    setError("");
    setNotice("");
    try {
      const res = await fetch(
        `${API_BASE}/api/vaults/dashboard?access_token=${encodeURIComponent(t)}`
      );
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
        `${window.location.pathname}#access=${encodeURIComponent(t)}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const travelPaid = params.get("travel_paid");
    const travelCanceled = params.get("travel_canceled");
    const editPaid = params.get("edit_paid");
    const editCanceled = params.get("edit_canceled");
    const fromHash = parseHashParam("access");
    if (fromHash) {
      setToken(fromHash);
      load(fromHash);
    }
    if (travelCanceled) {
      setNotice("Payment canceled. Travel mode was not turned on.");
    }
    if (travelPaid) {
      const raw = sessionStorage.getItem("cipherswitch-travel");
      sessionStorage.removeItem("cipherswitch-travel");
      if (!raw) {
        setError("Payment received, but the travel details were missing. Pay again to turn it on.");
      } else {
        const pending = JSON.parse(raw);
        setToken(pending.token || "");
        setBusy(true);
        fetch(`${API_BASE}/api/vaults/${pending.vaultId}/travel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_access_token: pending.token,
            travel_until: new Date(pending.until).toISOString(),
            travel_interval_days: Number(pending.days),
            checkout_session_id: travelPaid,
          }),
        })
          .then(async (res) => {
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(
                typeof json.detail === "string" ? json.detail : "Travel mode failed"
              );
            }
            setNotice(json.message || "Travel mode enabled");
            await load(pending.token);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "Error");
          })
          .finally(() => setBusy(false));
      }
    }
    if (editCanceled) {
      sessionStorage.removeItem("cipherswitch-edit");
      setNotice("Payment canceled. The vault was not changed.");
    }
    if (editPaid) {
      const raw = sessionStorage.getItem("cipherswitch-edit");
      sessionStorage.removeItem("cipherswitch-edit");
      if (!raw) {
        setError("Payment received, but the edited vault was missing. Pay again to add files.");
      } else {
        const pending = JSON.parse(raw);
        setToken(pending.token || "");
        setBusy(true);
        fetch(`${API_BASE}/api/vaults/${pending.vaultId}/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...pending.body, checkout_session_id: editPaid }),
        })
          .then(async (res) => {
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(
                typeof json.detail === "string" ? json.detail : "Could not update the vault"
              );
            }
            setNotice(json.message || "Vault updated.");
            await load(pending.token);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "Error");
          })
          .finally(() => setBusy(false));
      }
    }
    if (travelPaid || travelCanceled || editPaid || editCanceled) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enableTravel(vaultId) {
    const until = prompt("Travel until (YYYY-MM-DD or ISO datetime):");
    if (!until) return;
    const days = Number(prompt("Travel interval days (e.g. 30):", "30"));
    if (!days) return;
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
      window.location.assign(json.url);
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
    const next = [...editFiles];
    for (const file of list) {
      if (file.size > 1_500_000) {
        setEditError(`${file.name} is too large (max about 1.5MB).`);
        return;
      }
      next.push(await fileToAttachment(file));
    }
    setEditFiles(next);
  }

  async function saveEdit(vault) {
    if (!editTitle.trim() || !editMessage.trim()) {
      setEditError("Title and message are required.");
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
      };
      if (editFiles.length > 0 && !vault.has_attachments) {
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
        window.location.assign(json.url);
        return;
      }
      const res = await fetch(`${API_BASE}/api/vaults/${vault.vault_id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.detail === "string" ? json.detail : "Could not update the vault");
      }
      setEditPass("");
      closeEditor();
      setNotice(json.message || "Vault updated.");
      await load(token);
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
            {busy ? "Loading…" : "Open dashboard"}
          </button>
        </form>
      ) : (
        <div className="space-y-6 animate-fade-up-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              Signed in as <strong>{data.owner_email}</strong> · {data.vaults.length} vault
              {data.vaults.length === 1 ? "" : "s"}
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

          {data.vaults.map((v) => (
            <article key={v.vault_id} className="panel card-hover p-4 sm:p-6">
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

              <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <a href="/ping" className="btn-primary w-full !py-2 text-sm sm:w-auto">
                  Check in
                </a>
                <button
                  type="button"
                  className="btn-ghost w-full !py-2 text-sm sm:w-auto"
                  onClick={() =>
                    downloadIcsReminder({
                      title: `CipherSwitch check-in`,
                      description: `Vault ${v.vault_id}`,
                      nextPingDue: v.next_ping_due,
                      url: `${window.location.origin}/ping`,
                    })
                  }
                >
                  Calendar .ics
                </button>
                {v.status !== "TRIGGERED" ? (
                  <button
                    type="button"
                    className="btn-ghost w-full !py-2 text-sm sm:w-auto"
                    onClick={() => enableTravel(v.vault_id)}
                    disabled={busy}
                  >
                    Travel mode · $5 once
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
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`edit-message-${v.vault_id}`}>Message</label>
                        <textarea
                          id={`edit-message-${v.vault_id}`}
                          className="field min-h-32"
                          value={editMessage}
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
                        <input
                          className="field mt-2"
                          type="file"
                          multiple
                          onChange={(e) => {
                            const list = Array.from(e.target.files || []);
                            e.target.value = "";
                            addEditFiles(list);
                          }}
                        />
                        {!v.has_attachments && editFiles.length > 0 ? (
                          <p className="mt-2 text-sm text-ink-soft">
                            This vault has no files yet. Adding one is $3, paid once.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-primary !py-2 text-sm"
                          onClick={() => saveEdit(v)}
                          disabled={busy}
                        >
                          {editFiles.length > 0 && !v.has_attachments ? "Pay $3 and save" : "Save seal"}
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
