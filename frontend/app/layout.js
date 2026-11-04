import Script from "next/script";
import "./globals.css";
import MobileNav from "../components/MobileNav";
import AccessibilityWidget from "../components/AccessibilityWidget";

export const metadata = {
  title: "CipherSwitch — Dead Man's Switch",
  description:
    "A private digital time capsule. Encrypt secrets in your browser. They open only if you go silent.",
  robots: { index: true, follow: true },
  verification: {
    google: "8IAH4DAVLgJAk1q1e3_gEYDjcje8_Q2vzN51PE5C1MY",
  },
  appleWebApp: {
    capable: true,
    title: "CipherSwitch",
    statusBarStyle: "default",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#5DA8DE",
};

export default function RootLayout({ children }) {
  const year = new Date().getFullYear();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <Script
          src="https://www.googletagmanager.com/gtm.js?id=GTM-5Q3KJBX6"
          strategy="beforeInteractive"
        />
        <Script id="google-tag" strategy="beforeInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`}
        </Script>
      </head>
      <body className="font-sans antialiased text-ink bg-white">
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <div className="relative flex min-h-dvh flex-col overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
          <header className="sticky top-0 z-50 border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)]">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-8">
              <a href="/" className="min-w-0">
                <p className="truncate text-lg font-extrabold tracking-tight text-ink">
                  CipherSwitch
                </p>
              </a>
              <MobileNav />
            </div>
          </header>
          <main id="content" tabIndex={-1} className="relative z-10 flex-1">
            {children}
          </main>
          <footer className="mt-auto border-t border-slate-200 bg-white py-8 sm:py-10">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ink">
                <a href="/about" className="underline-offset-4 hover:underline">
                  About
                </a>
                <a href="/terms" className="underline-offset-4 hover:underline">
                  Terms and conditions
                </a>
                <a href="/privacy" className="underline-offset-4 hover:underline">
                  Privacy policy
                </a>
                <a href="/contact" className="underline-offset-4 hover:underline">
                  Contact
                </a>
                <AccessibilityWidget />
              </nav>
              <p className="text-sm text-ink-soft">
                All rights reserved {year} CipherSwitch
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
