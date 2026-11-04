"use client";

import { useCallback, useEffect, useState } from "react";
import WidgetSkeleton from "../../components/WidgetSkeleton";
import { apiBase } from "../../utils/api";
import { buildPingUrl, parseHashParam } from "../../utils/crypto";

const API_BASE = apiBase(process.env.NEXT_PUBLIC_API_URL);

export default function PingPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("awaiting");
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [newPingUrl, setNewPingUrl] = useState("");

  const registerPing = useCallback(async (rawToken) => {
    const trimmed = (rawToken || "").trim();
    if (trimmed.length < 32) {
      setStatus("error");
      setError("Check-in token is missing or too short.");
      return;
    }

    setStatus("checking");
    setError("");
    setPayload(null);
    setNewPingUrl("");

    try {
      const response = await fetch(`${API_BASE}/api/vaults/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : "Check-in failed. Token may be invalid, rotated, or vault triggered.";
        throw new Error(detail);
      }

      setPayload(data);
      const origin = window.location.origin;
      const nextUrl = buildPingUrl(origin, data.new_ping_token);
      setNewPingUrl(nextUrl);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}#token=${encodeURIComponent(data.new_ping_token)}`
      );
      setToken(data.new_ping_token);
      setStatus("ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const fromHash = parseHashParam("token");
    const fromQuery =
      new URLSearchParams(window.location.search).get("token") || "";
    const initial = fromHash || fromQuery;
    if (initial) {
      setToken(initial);
      if (fromQuery && !fromHash) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}#token=${encodeURIComponent(fromQuery)}`
        );
      }
      registerPing(initial);
    }
  }, [registerPing]);

  function handleManualSubmit(event) {
    event.preventDefault();
    registerPing(token);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-8 sm:py-16">
      <div className="mb-8 animate-fade-up">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky">
          Heartbeat
        </p>
        <h1 className="mt-3 heading-caps text-3xl text-ink sm:text-4xl">Check in</h1>
        <p className="mt-3 text-ink-soft">
          Confirm you&apos;re still around. This rolls your deadline forward and
          issues a new check-in link.
        </p>
      </div>

      <div className="panel animate-fade-up-1 p-4 sm:p-8">
        {status === "checking" && <WidgetSkeleton label="Updating your deadline" />}

        {status === "ok" && payload && (
          <div className="animate-scale-in space-y-5">
            <p className="inline-flex rounded-full px-3 py-1 text-sm font-semibold status-ok">
              Heartbeat accepted
            </p>
            <p className="text-ink-soft">{payload.message}</p>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-bold uppercase tracking-wide text-ink-faint">
                  Vault
                </dt>
                <dd className="mt-1 break-anywhere font-mono text-ink">
                  {payload.vault_id}
                </dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-wide text-ink-faint">
                  Last check-in
                </dt>
                <dd className="mt-1 text-ink">
                  {new Date(payload.last_ping_at).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-wide text-ink-faint">
                  Next deadline
                </dt>
                <dd className="mt-1 font-semibold text-sky">
                  {new Date(payload.next_ping_due).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-wide text-ink-faint">
                  New check-in link
                </dt>
                <dd className="mt-2 max-w-full min-w-0 break-anywhere rounded-2xl bg-sky-mist p-3 font-mono text-xs text-sky-deep">
                  {newPingUrl}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="btn-primary w-full sm:w-auto"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(newPingUrl);
                } catch {
                  /* ignore */
                }
              }}
            >
              Copy new link
            </button>
            <div>
              <a href="/" className="btn-ghost inline-flex">
                Home
              </a>
            </div>
          </div>
        )}

        {status === "error" && (
          <div
            role="alert"
            className="mb-5 rounded-2xl px-4 py-3 text-sm status-err"
          >
            {error}
          </div>
        )}

        {(status === "awaiting" || status === "error") && (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="token">
                Check-in token
              </label>
              <input
                id="token"
                className="field"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the token from your check-in link"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              Register check-in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
