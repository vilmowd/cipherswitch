"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const STORAGE_KEY = "cipherswitch-a11y";

const DEFAULTS = {
  text: "md",
  contrast: "default",
  links: false,
  font: false,
  spacing: false,
  motion: false,
  cursor: false,
};

function readSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function applySettings(settings) {
  const root = document.documentElement;
  root.dataset.a11yText = settings.text;
  root.dataset.a11yContrast = settings.contrast;
  root.dataset.a11yLinks = settings.links ? "on" : "off";
  root.dataset.a11yFont = settings.font ? "readable" : "default";
  root.dataset.a11ySpacing = settings.spacing ? "relaxed" : "normal";
  root.dataset.a11yMotion = settings.motion ? "reduce" : "full";
  root.dataset.a11yCursor = settings.cursor ? "large" : "default";
}

function focusable(root) {
  return Array.from(
    root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.disabled && el.tabIndex !== -1);
}

export default function AccessibilityWidget() {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const launcherRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState(DEFAULTS);

  useLayoutEffect(() => {
    setMounted(true);
    const saved = readSettings();
    setSettings(saved);
    applySettings(saved);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const panel = panelRef.current;
    const first = panel ? focusable(panel)[0] : null;
    first?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = focusable(panelRef.current);
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = priorOverflow;
      if (previous instanceof HTMLElement) previous.focus();
      else launcherRef.current?.focus();
    };
  }, [open]);

  function update(next) {
    setSettings(next);
    applySettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function toggle(key) {
    update({ ...settings, [key]: !settings[key] });
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className="text-sm font-semibold text-ink underline-offset-4 hover:underline"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "a11y-dialog" : undefined}
        onClick={() => setOpen(true)}
      >
        Accessibility
      </button>

      {open && mounted
        ? createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            id="a11y-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="a11y-panel relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl3 border border-slate-200 bg-white p-5 shadow-pop sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="text-xl font-extrabold text-ink">
                  Accessibility options
                </h2>
                <p id={descId} className="mt-1 text-sm leading-relaxed text-ink-soft">
                  These controls change how this site looks in this browser.
                  Your choices stay on this device.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-lg font-bold text-ink"
                onClick={() => setOpen(false)}
              >
                <span aria-hidden="true">×</span>
                <span className="sr-only">Close accessibility options</span>
              </button>
            </div>

            <fieldset className="mt-5">
              <legend className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
                Text size
              </legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  ["md", "Default"],
                  ["lg", "Large"],
                  ["xl", "Larger"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={settings.text === value}
                    className={choiceClass(settings.text === value)}
                    onClick={() => update({ ...settings, text: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-4">
              <legend className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
                Contrast
              </legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  ["default", "Default"],
                  ["high", "High"],
                  ["dark", "Dark"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={settings.contrast === value}
                    className={choiceClass(settings.contrast === value)}
                    onClick={() => update({ ...settings, contrast: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-4 grid gap-2">
              <Toggle
                pressed={settings.links}
                onClick={() => toggle("links")}
                label="Highlight links"
              />
              <Toggle
                pressed={settings.font}
                onClick={() => toggle("font")}
                label="Readable font"
              />
              <Toggle
                pressed={settings.spacing}
                onClick={() => toggle("spacing")}
                label="Increase text spacing"
              />
              <Toggle
                pressed={settings.motion}
                onClick={() => toggle("motion")}
                label="Pause animations"
              />
              <Toggle
                pressed={settings.cursor}
                onClick={() => toggle("cursor")}
                label="Larger cursor"
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                className="text-sm font-bold text-sky-deep underline-offset-4 hover:underline"
                onClick={() => update(DEFAULTS)}
              >
                Reset to default
              </button>
              <a href="/privacy" className="text-sm font-semibold text-ink-soft underline-offset-4 hover:underline">
                Privacy policy
              </a>
            </div>
          </div>
        </div>,
          document.body
        )
        : null}
    </>
  );
}

function choiceClass(active) {
  return active
    ? "min-h-11 rounded-2xl border border-ink bg-ink px-3 py-2 text-sm font-bold text-white"
    : "min-h-11 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-ink";
}

function Toggle({ pressed, onClick, label }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-2 text-left text-sm font-semibold text-ink"
    >
      <span>{label}</span>
      <span
        className={`inline-flex h-7 min-w-14 items-center justify-center rounded-full px-2 text-xs font-bold ${
          pressed ? "bg-ink text-white" : "bg-slate-100 text-ink-soft"
        }`}
      >
        {pressed ? "On" : "Off"}
      </span>
    </button>
  );
}

