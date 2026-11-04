import Reveal from "../components/Reveal";

const STEPS = [
  {
    n: "01",
    title: "Encrypt here",
    body: "Title and message are sealed with Argon2id and AES-GCM before upload.",
  },
  {
    n: "02",
    title: "Check in",
    body: "A private link rolls your deadline forward. Miss it and the vault opens for your recipient.",
  },
  {
    n: "03",
    title: "They unlock",
    body: "After it triggers, they open it with their unlock link and the shared passphrase.",
  },
];

const KINDS = [
  {
    title: "Last letter",
    body: "A personal message that stays sealed until you stop checking in.",
  },
  {
    title: "Recovery codes",
    body: "Backup codes for accounts, held for someone you trust.",
  },
  {
    title: "Seed phrase",
    body: "Wallet words or key material, sealed with its own passphrase.",
  },
  {
    title: "Executor notes",
    body: "Where papers live, who to call, and what to do first.",
  },
  {
    title: "If unreachable",
    body: "A plan for when you cannot be reached for a stretch of time.",
  },
  {
    title: "Files",
    body: "Attachments are encrypted on your device, the same way as the message.",
  },
];

const WAITS = [
  {
    title: "Check-in interval",
    body: "You choose the gap, often 7, 14, or 30 days. Each check-in rolls the deadline forward and retires the old link.",
  },
  {
    title: "Grace period",
    body: "After a missed check-in, an extra wait can run before the vault opens. You set how many days.",
  },
  {
    title: "Travel mode",
    body: "A longer interval for a trip, so a flight or a dead phone does not open the vault.",
  },
  {
    title: "Time-lock",
    body: "An optional calendar date. The vault can also wait until that moment, not only until silence.",
  },
];

const WHY = [
  {
    title: "No account",
    body: "A passphrase and a private link. Nothing to log into, and nothing for us to reset.",
  },
  {
    title: "Encrypted first",
    body: "The title, the message, and the files are sealed in the browser before upload.",
  },
  {
    title: "Silence, not a request",
    body: "It opens because you stopped checking in, not because someone asked.",
  },
  {
    title: "A witness can stay blind",
    body: "You can notify someone when it triggers without giving them a way to read it.",
  },
];

const RISKS = [
  {
    title: "A lost passphrase is gone",
    body: "We never see the message, so we cannot recover it. Share the passphrase only with the person who should open it.",
  },
  {
    title: "A missed check-in still counts",
    body: "If you forget, the grace period is the only pause. After that, the people you named can open it.",
  },
  {
    title: "Not a will",
    body: "This is not legal, medical, or financial advice, and a triggered vault is not proof of death.",
  },
  {
    title: "Email can fail",
    body: "Release depends on the note reaching your recipient. Keep the unlock link somewhere they can find it.",
  },
];

const NEVER = [
  "Passphrases never leave the browser",
  "Titles are encrypted like the message",
  "Check-in tokens rotate after every ping",
  "Unlock needs a recipient token and the passphrase",
  "The payload stays withheld until the vault triggers",
  "An HMAC check runs before anything decrypts",
];

function SealedFile() {
  return (
    <svg
      viewBox="0 0 260 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      style={{ height: "100%", width: "auto" }}
      aria-hidden
    >
      <path
        d="M34 40
           C34 26 44 16 58 16
           H168
           L226 74
           V276
           C226 294 212 308 194 308
           H58
           C44 308 34 294 34 276
           Z"
        fill="#F4F9FD"
        stroke="#5DA8DE"
        strokeWidth="3"
      />
      <path d="M168 16 L226 74 H190 C178 74 168 64 168 52 Z" fill="#8fd0c0" />
      <path
        fill="#5DA8DE"
        d="M102 128
           V98
           C102 70 158 70 158 98
           V128
           H142
           V100
           C142 86 118 86 118 100
           V128
           Z"
      />
      <rect x="94" y="116" width="72" height="52" rx="8" fill="#5DA8DE" />
      <circle cx="130" cy="136" r="6.5" fill="#1A1F2C" />
      <path d="M126.4 140 H133.6 L132 156 H128 Z" fill="#1A1F2C" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <div>
          <h1 className="animate-fade-up text-[2.75rem] font-extrabold leading-[0.95] tracking-tight text-ink sm:text-6xl lg:text-7xl">
            Dead <span className="text-sky">switch.</span>
          </h1>
          <p className="animate-fade-up-2 mt-6 max-w-md text-base leading-relaxed text-ink-soft sm:text-lg">
            A vault that stays shut until you stop checking in. Encrypted on
            your device. Released only by silence.
          </p>
          <div className="animate-fade-up-3 mt-8 hidden items-center gap-3 md:flex">
            <a href="/create" className="btn-primary">
              Seal a vault
            </a>
            <a href="#how" className="btn-ghost">
              How it works
            </a>
          </div>
        </div>

        <div className="animate-fade-up-2 relative mx-auto h-[32rem] w-full max-w-lg sm:h-[38rem]">
          <div
            aria-hidden
            className="absolute right-[16%] top-[2%] grid animate-float grid-cols-4 gap-2"
            style={{ animationDelay: "0.4s" }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-sky" />
            ))}
          </div>
          <div
            aria-hidden
            className="absolute right-[4%] top-[12%] h-20 w-20 animate-float rounded-full bg-sky sm:h-24 sm:w-24"
            style={{ animationDuration: "6.5s" }}
          />
          <svg
            aria-hidden
            viewBox="0 0 80 72"
            className="absolute bottom-[30%] left-[6%] animate-float text-[#8fd0c0]"
            style={{ height: "4.25rem", width: "4.5rem", animationDelay: "0.8s" }}
          >
            <path d="M6 66 L74 66 L40 6 Z" fill="currentColor" />
          </svg>
          <div
            aria-hidden
            className="absolute bottom-[28%] right-[4%] h-14 w-14 animate-float rounded-md bg-[#8fd0c0]"
            style={{ animationDelay: "1.1s", animationDuration: "7.5s" }}
          />

          <div className="absolute inset-x-0 top-0 flex justify-center">
            <div className="relative h-[24rem] animate-float sm:h-[29rem]" style={{ animationDuration: "7s" }}>
              <SealedFile />
              <div className="absolute bottom-[15%] left-0 right-0 flex justify-center px-6">
                <div className="rounded-lg bg-sky/20 px-2.5 py-1.5 text-ink">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className="h-2 w-2 shrink-0 rounded-sm bg-[#8fd0c0]" aria-hidden />
                    Active · waiting for check-in
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">
                    Releases on silence — not on request.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="border-t border-slate-200">
        <Reveal className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20">
          <h2 className="max-w-md text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">
            It opens when you go quiet.
          </h2>
          <div>
            <p className="max-w-md text-base leading-relaxed text-ink-soft">
              Three steps. No account. The server never sees the words, the
              passphrase, or the keys.
            </p>
            <ol className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
              {STEPS.map((step) => (
                <li key={step.n} className="grid grid-cols-[3rem_1fr] gap-4 py-5">
                  <span className="pt-0.5 text-sm font-semibold text-sky">{step.n}</span>
                  <div>
                    <h3 className="text-lg font-bold text-ink">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </section>

      <section className="border-t border-slate-200">
        <Reveal className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="max-w-sm text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">
              What you can seal.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">
              A template is only a starting point. The vault holds whatever you
              write, plus files encrypted the same way.
            </p>
          </div>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {KINDS.map((item) => (
              <li key={item.title} className="py-4">
                <h3 className="text-base font-bold text-ink">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <section className="border-t border-slate-200">
        <Reveal className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="max-w-sm text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">
              How long it waits.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">
              You set the clock. Nothing opens because someone requested it.
            </p>
          </div>
          <ol className="divide-y divide-slate-200 border-y border-slate-200">
            {WAITS.map((item, index) => (
              <li key={item.title} className="grid grid-cols-[3rem_1fr] gap-4 py-5">
                <span className="pt-0.5 text-sm font-semibold text-sky">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <section className="border-t border-slate-200">
        <Reveal className="mx-auto grid max-w-6xl gap-16 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="max-w-sm text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">
              Why people use it.
            </h2>
            <ul className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
              {WHY.map((item) => (
                <li key={item.title} className="py-4">
                  <h3 className="text-base font-bold text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="max-w-sm text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">
              What can go wrong.
            </h2>
            <ul className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
              {RISKS.map((item) => (
                <li key={item.title} className="py-4">
                  <h3 className="text-base font-bold text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.body}</p>
                </li>
              ))}
            </ul>
            <a href="/terms" className="mt-6 inline-block text-sm font-semibold text-sky hover:underline">
              Read the terms
            </a>
          </div>
        </Reveal>
      </section>

      <section className="border-t border-slate-200">
        <Reveal className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="max-w-sm text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">
              Free to seal. Pay when you add more.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">
              A vault with one recipient is free. There is no subscription.
              Each paid use is charged once, and the next use is charged again.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-sky">Free</p>
              <h3 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">$0</h3>
              <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200 text-sm text-ink">
                <li className="py-3">One recipient</li>
                <li className="py-3">Encrypted message</li>
                <li className="py-3">Check-ins and a grace period</li>
                <li className="py-3">A dry-run test</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-sky">One time, per use</p>
              <h3 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">$5</h3>
              <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200 text-sm text-ink">
                <li className="py-3">More than one recipient</li>
                <li className="py-3">Encrypted files</li>
                <li className="py-3">A time-lock date</li>
                <li className="py-3">Travel mode</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="border-t border-slate-200">
        <Reveal className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <h2 className="max-w-sm text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">
              What we never see.
            </h2>
            <a href="/create" className="btn-primary mt-8">
              Create your vault
            </a>
          </div>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {NEVER.map((item) => (
              <li key={item} className="py-4 text-base text-ink">
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>
    </div>
  );
}
