"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ping", label: "Check in" },
  { href: "/create", label: "Create vault", primary: true },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Desktop */}
      <nav className="hidden items-center gap-7 md:flex">
        {LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={
              link.primary
                ? "btn-primary !min-h-0 !px-4 !py-2 text-sm"
                : "text-sm font-semibold text-ink hover:text-sky"
            }
          >
            {link.label}
          </a>
        ))}
      </nav>

      {/* Mobile toggle */}
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-white md:hidden"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">Menu</span>
        <span className="relative block h-4 w-5">
          <span
            className={`absolute left-0 block h-0.5 w-5 rounded bg-ink transition ${
              open ? "top-1.5 rotate-45" : "top-0"
            }`}
          />
          <span
            className={`absolute left-0 top-1.5 block h-0.5 w-5 rounded bg-ink transition ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`absolute left-0 block h-0.5 w-5 rounded bg-ink transition ${
              open ? "top-1.5 -rotate-45" : "top-3"
            }`}
          />
        </span>
      </button>

      {open ? (
        <div
          id="mobile-menu"
          className="fixed inset-x-0 top-[65px] z-40 border-b border-slate-200 bg-white p-4 md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-3">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={
                  link.primary
                    ? "btn-primary w-full !min-h-[48px]"
                    : "btn-ghost w-full !min-h-[48px]"
                }
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {open ? (
        <button
          type="button"
          className="fixed inset-0 top-[65px] z-30 bg-ink/20 md:hidden"
          aria-label="Dismiss menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
