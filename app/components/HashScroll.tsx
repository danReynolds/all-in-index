"use client";

import { useEffect } from "react";

/**
 * Hard loads of a deep link (e.g. /holding/googl#takes-sacks, shared or
 * bookmarked) often don't auto-scroll: the browser jumps before the charts and
 * images below settle, then never re-fires. This nudges the target into view
 * once layout has stabilized. `scroll-margin` on the target handles the offset
 * under the sticky header. Soft (clicked) navigations already work; re-running
 * for the same anchor is harmless.
 */
export function HashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const scroll = () => document.getElementById(id)?.scrollIntoView({ block: "start" });
    const raf = requestAnimationFrame(() => requestAnimationFrame(scroll));
    const t = setTimeout(scroll, 450);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);
  return null;
}
