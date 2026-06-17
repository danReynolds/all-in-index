"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import "./globals.css";

// Last-resort boundary: catches errors thrown by the root layout itself, which
// error.tsx cannot reach. It replaces the entire shell, so it must render its
// own <html>/<body> and pull in global styles. Fonts fall back to system-ui
// (the next/font variables live in the layout this file is replacing).
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full text-neutral-100">
        <title>Something went wrong · The All-Index</title>
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-5 text-center">
          <div className="font-mono text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
            Bad beat
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Something went wrong.</h1>
          <p className="max-w-md text-sm leading-relaxed text-neutral-400">
            The All-Index hit an unexpected error. This is usually transient — try again, or
            reload the page.
          </p>
          {error.digest && (
            <p className="font-mono text-[11px] text-neutral-600">ref: {error.digest}</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => unstable_retry()}
              className="inline-flex rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-400"
            >
              Try again
            </button>
            {/* Hard navigation on purpose: the root layout (router + providers)
                has failed, so a full reload re-initializes the app cleanly
                rather than soft-navigating from a broken tree. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex rounded-full border border-neutral-700 px-5 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
            >
              Back to the index
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
