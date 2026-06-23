import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "About & disclaimer",
  description:
    "What The All-Index is, how the data is made (and its limits), and the disclaimers — an independent, unofficial project. Not financial advice.",
  alternates: { canonical: "/about" },
};

// One place to change the contact address.
const CONTACT = "me@danreynolds.ca";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-bold tracking-tight text-neutral-200">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-neutral-400">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">About &amp; disclaimer</h1>
        <p className="text-neutral-400">
          The All-Index is an independent, unofficial project that tracks every investment call made on
          the All-In podcast — automatically extracted, attributed, and scored against the market. It&apos;s
          a fan project built out of curiosity, not a financial product.
        </p>
      </header>

      <Section title="Not affiliated with the podcast">
        <p>
          The All-Index is{" "}
          <strong className="text-neutral-300">not affiliated with, endorsed by, or sponsored by</strong>{" "}
          the All-In podcast or its hosts. &ldquo;All-In&rdquo; and the hosts&apos; names are used only to
          identify the podcast this project covers; all trademarks belong to their respective owners. For
          the real thing, visit the{" "}
          <a
            href="https://allin.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:underline"
          >
            official All-In podcast
          </a>
          .
        </p>
      </Section>

      <Section title="How the data is made — and its limits">
        <p>
          Every call here is{" "}
          <strong className="text-neutral-300">automatically extracted by an AI</strong> (a large language
          model) from publicly available episode audio, then attributed to a host and scored. It is a{" "}
          <strong className="text-neutral-300">best-effort interpretation</strong>: it can misattribute a
          quote, misread a stance, or treat an offhand comment as a call. Nothing here has been reviewed or
          verified by the hosts.
        </p>
        <p>
          Treat every label and figure as <em>our reading</em> of what was said — opinion and commentary, not
          a statement of fact about what anyone actually did or holds. Every call links back to the exact
          episode and timestamp so you can check the source yourself.
        </p>
      </Section>

      <Section title="Not financial advice">
        <p>
          Everything on this site is for{" "}
          <strong className="text-neutral-300">informational and commentary purposes only</strong>. It is not
          financial, investment, tax, or legal advice, and nothing here is a recommendation, solicitation, or
          offer to buy or sell any security. Do your own research, and invest at your own risk.
        </p>
      </Section>

      <Section title="About the scores">
        <p>
          Returns and &ldquo;alpha&rdquo; are <strong className="text-neutral-300">hypothetical</strong>. We
          price each call at the market close on the day it aired and track it against the S&amp;P 500,
          equal-weighted — a scoreboard, not a strategy you could have traded (no fees, borrow costs, or
          slippage, and prices are approximate).{" "}
          <strong className="text-neutral-300">Past scored performance is not an indicator of future results</strong>{" "}
          and does not represent returns any investor actually earned.
        </p>
      </Section>

      <Section title="Corrections &amp; removal">
        <p>
          Spotted an error, or want something corrected or removed? Email{" "}
          <a href={`mailto:${CONTACT}?subject=All-Index%20correction`} className="text-emerald-400 hover:underline">
            {CONTACT}
          </a>
          . We&apos;ll fix it or take it down in good faith.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          No accounts, no sign-ups, and no personal data collected. We use privacy-friendly analytics
          (Vercel) to count visits in aggregate — no ad trackers, and nothing is sold.
        </p>
      </Section>
    </div>
  );
}
