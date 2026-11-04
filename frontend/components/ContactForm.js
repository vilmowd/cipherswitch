"use client";

import { useState } from "react";
import { apiBase } from "../utils/api";

const API_BASE = apiBase(process.env.NEXT_PUBLIC_API_URL);

export default function ContactForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof data.detail === "string" ? data.detail : "The message could not be sent.";
        throw new Error(detail);
      }
      setSent(true);
    } catch (err) {
      const text = err instanceof Error ? err.message : "The message could not be sent.";
      setError(
        text === "Failed to fetch"
          ? "The server did not answer. Please try again in a moment."
          : text
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="rounded-2xl bg-sky-soft px-4 py-3 text-sm text-ink" role="status">
        Your message was sent.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="contact-first">First name</label>
          <input
            id="contact-first"
            className="field"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            maxLength={80}
            autoComplete="given-name"
            required
            disabled={busy}
          />
        </div>
        <div>
          <label className="label" htmlFor="contact-last">Last name</label>
          <input
            id="contact-last"
            className="field"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            maxLength={80}
            autoComplete="family-name"
            required
            disabled={busy}
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="contact-email">Email</label>
        <input
          id="contact-email"
          type="email"
          className="field"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          disabled={busy}
        />
      </div>
      <div>
        <label className="label" htmlFor="contact-message">Message</label>
        <textarea
          id="contact-message"
          className="field min-h-[160px]"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={4000}
          required
          disabled={busy}
        />
      </div>
      {error ? (
        <p className="rounded-2xl px-4 py-3 text-sm status-err" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
