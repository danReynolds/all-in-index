"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Scroll-triggered entrance. Children render server-side and stay visible
 * without JS (the hiding styles are gated on `scripting: enabled`); with JS,
 * content fades up the first time it scrolls into view.
 *
 * Direct children marked `.stagger-item` (with an inline `--d` delay) animate
 * individually; everything else animates as one block via `.reveal-content`.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  stagger = false,
}: {
  children: ReactNode;
  /** Base delay in ms, applied to the whole block. */
  delay?: number;
  className?: string;
  /** When true, skip the block wrapper — children carry `.stagger-item`. */
  stagger?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Fast path: already in view at mount (also covers environments where
    // IO callbacks are suspended, e.g. hidden/prerendered tabs).
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      // Fire essentially on entry — a later margin reads as blank space when
      // the reader scrolls fast.
      { rootMargin: "0px 0px -2% 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="reveal">
      {stagger ? (
        children
      ) : (
        <div
          className={`reveal-content ${className ?? ""}`}
          style={delay ? ({ "--d": `${delay}ms` } as CSSProperties) : undefined}
        >
          {children}
        </div>
      )}
    </div>
  );
}
