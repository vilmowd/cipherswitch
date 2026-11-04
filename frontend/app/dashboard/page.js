"use client";

import { useCallback, useEffect, useState } from "react";
import {
  downloadIcsReminder,
  parseHashParam,
} from "../../utils/crypto";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function DashboardPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (access) => {
    const t = (access || token).trim();
    if (t.length < 32) {
      setError("Paste your dashboard access token (from create email / success screen).");
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
    const fromHash = parseHashParam("access");
    if (fromHash) {
      setToken(fromHash);
      load(fromHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enableTravel(vaultId) {
    const until = prompt("Travel until (YYYY-MM-DD or ISO datetime):");
    if (!until) return;
    const days = Number(prompt("Travel interval days (e.g. 30):", "30"));
    if (!days) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/vaults/${vaultId}/travel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_access_token: token,
          travel_until: new Date(until).toISOString(),
          travel_interval_days: days,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "Travel mode failed");
      setNotice(json.message || "Travel mode enabled");
      await load(token);
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
              placeholder="From your seal confirmation or email"
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
                    Travel mode
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
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
