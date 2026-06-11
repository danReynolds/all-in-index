import type { Metadata } from "next";
import { Geist, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/app/components/Logo";
import { NavLinks } from "@/app/components/NavLinks";
import { Ticker } from "@/app/components/Ticker";
import { PlayerProvider } from "@/app/components/player";
import { getIndex } from "@/lib/data";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "The All-Index", template: "%s · The All-Index" },
  description:
    "Every call on the All-In podcast — extracted, attributed, and scored against the market. Per-host track records, the Besties Index, and the Bear Book.",
  openGraph: { siteName: "The All-Index", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { snapshot } = getIndex();
  const tickerItems = (snapshot.indexFund?.constituents ?? []).map((c) => ({
    slug: c.slug,
    ticker: c.ticker,
    ret: c.sinceReturn,
  }));

  return (
    <html
      lang="en"
      // Tells Next 16 to suppress CSS smooth-scrolling during route
      // transitions (instant scroll-to-top), keeping it for in-page anchors.
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-neutral-100">
        <PlayerProvider>
        <header className="sticky top-0 z-40 border-b border-white/5 bg-neutral-950/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="inline-flex transition-transform duration-500 ease-out group-hover:rotate-[360deg]">
                <Logo size={26} />
              </span>
              <span className="font-display text-[17px] font-bold tracking-tight">
                The All-Index
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <NavLinks />
              <span className="hidden rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-neutral-500 sm:inline">
                unofficial
              </span>
            </div>
          </div>
          <Ticker items={tickerItems} />
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">{children}</main>

        <footer className="border-t border-white/5 px-5 py-8 text-xs leading-relaxed text-neutral-500">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2">
              <Logo size={20} />
              <span className="font-display font-bold">The All-Index</span>
            </div>
            <div className="max-w-xl space-y-1">
              <p>
                <strong className="text-neutral-400">Not financial advice.</strong> For
                informational and commentary purposes only. This is an independent, unofficial
                project and is not affiliated with or endorsed by the All-In podcast or its hosts.
              </p>
              <p>
                Theses are extracted from publicly available episodes; short excerpts are quoted
                with attribution and link back to the source. Market data via Yahoo Finance.
              </p>
            </div>
          </div>
        </footer>
        </PlayerProvider>
      </body>
    </html>
  );
}
