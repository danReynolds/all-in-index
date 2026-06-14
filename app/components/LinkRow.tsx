"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A table row that navigates to `href` when clicked anywhere — so the whole row
 * is a target, not just the first cell's link. Nested links/buttons keep their
 * own behavior (a host avatar still goes to that host), and modifier/middle
 * clicks fall through to the browser so the inner <Link> can open a new tab.
 */
export function LinkRow({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        // Let a clicked nested link/button handle its own navigation.
        if ((e.target as HTMLElement).closest("a, button")) return;
        router.push(href);
      }}
      className={`cursor-pointer ${className}`}
    >
      {children}
    </tr>
  );
}
