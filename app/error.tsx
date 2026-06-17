"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/app/components/Logo";

// Catches unexpected runtime errors thrown while rendering a page segment. It
// renders inside the root layout (header/footer stay), so a single broken route
// degrades gracefully instead of taking down the shell. Errors in the root
// layout itself are handled by global-error.tsx.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface the error in the browser console / Vercel logs. In production the
    // server-side digest is the handle to match this against the server logs.
    console.error(error);
  }, [error]);

  return (
    <div className="rise mx-auto max-w-2xl space-y-8 py-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="opacity-90">
          <Logo size={56} />
        </span>
        <div className="font-mono text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
          Bad beat
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Something went sideways.
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-neutral-400">
          This page hit an unexpected error while loading. It&apos;s usually transient —
          try again, and if it sticks around, head back to the index.
        </p>
        {error.digest && (
          <p className="font-mono text-[11px] text-neutral-600">ref: {error.digest}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => unstable_retry()}
          className="inline-flex rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-400 hover:shadow-[0_0_24px_-6px_rgba(16,185,129,0.7)]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex rounded-full border border-neutral-700 px-5 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
        >
          Back to the index
        </Link>
      </div>
    </div>
  );
}
