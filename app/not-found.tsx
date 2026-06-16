import Link from "next/link";
import { Logo } from "@/app/components/Logo";

// Rendered for both notFound() calls in dynamic routes (a holding/host/guest/
// episode slug that doesn't exist) and for any unmatched URL across the site.
// It renders inside the root layout, so the header, ticker, and footer stay put.
export const metadata = {
  title: "Not found",
  description: "That page isn't in the deck.",
};

const LINKS = [
  { href: "/the-index", label: "The Index", hint: "the funds + every holding" },
  { href: "/predictions", label: "Predictions", hint: "annual calls, graded" },
  { href: "/insights", label: "Insights", hint: "flips, conviction, consensus" },
  { href: "/episodes", label: "Episodes", hint: "browse by show" },
];

export default function NotFound() {
  return (
    <div className="rise mx-auto max-w-2xl space-y-8 py-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="opacity-90">
          <Logo size={56} />
        </span>
        <div className="font-mono text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
          404
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          That page folded.
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-neutral-400">
          We couldn&apos;t find what you were after — the company, host, or episode may have
          a different name, or the link is just off. No worries; the table&apos;s still here.
        </p>
      </div>

      <div className="grid gap-3 text-left sm:grid-cols-2">
        {LINKS.map(({ href, label, hint }) => (
          <Link
            key={href}
            href={href}
            className="group card-lift rounded-xl border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-100">{label}</span>
              <span className="arrow-nudge text-neutral-500 transition-colors group-hover:text-emerald-400">
                →
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{hint}</p>
          </Link>
        ))}
      </div>

      <div>
        <Link
          href="/"
          className="inline-flex rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-400 hover:shadow-[0_0_24px_-6px_rgba(16,185,129,0.7)]"
        >
          Back to the index
        </Link>
      </div>
    </div>
  );
}
