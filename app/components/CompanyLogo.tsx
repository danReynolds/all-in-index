"use client";

import { useEffect, useRef, useState } from "react";

const SIZES = { sm: 20, md: 28, lg: 44 } as const;

// Deterministic tint for the monogram fallback.
const PALETTE = ["#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#14b8a6", "#f43f5e"];
function tint(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Company logo with a graceful chain: Clearbit (by domain) → Google favicon →
 * tinted monogram. Domain-less holdings go straight to the monogram.
 */
export function CompanyLogo({
  name,
  domain,
  size = "md",
  className = "",
}: {
  name: string;
  domain?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  const sources = domain
    ? [
        `https://logo.clearbit.com/${domain}`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=${px * 2}`,
      ]
    : [];
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLImageElement>(null);

  // If the image already failed before hydration, onError never fires —
  // detect the dead image on mount and advance the fallback chain.
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setIdx((i) => i + 1);
  }, [idx]);

  if (idx < sources.length) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        src={sources[idx]}
        alt=""
        aria-hidden
        loading="lazy"
        width={px}
        height={px}
        onError={() => setIdx(idx + 1)}
        className={`shrink-0 rounded-md bg-white/90 object-contain p-0.5 ring-1 ring-white/10 ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-display font-bold text-white ring-1 ring-white/10 ${className}`}
      style={{ width: px, height: px, background: tint(name), fontSize: px * 0.45 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
