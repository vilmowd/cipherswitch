export const metadataBase = {
  updated: "4 November 2026",
};

export default function LegalPage({ title, intro, children }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-8 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky">
        CipherSwitch
      </p>
      <h1 className="mt-3 heading-caps text-4xl text-ink sm:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-ink-faint">
        Last updated {metadataBase.updated}
      </p>
      {intro ? (
        <p className="mt-6 text-base leading-relaxed text-ink-soft">{intro}</p>
      ) : null}
      <div className="mt-8 space-y-8 text-sm leading-relaxed text-ink-soft sm:text-base">
        {children}
      </div>
    </article>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="text-lg font-extrabold text-ink">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
