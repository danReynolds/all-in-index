import Link from "next/link";
import type { ReactNode } from "react";

/** Consistent back-navigation chip used at the top of detail pages. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-1.5 text-sm text-neutral-400 transition-colors hover:border-white/25 hover:bg-white/[0.05] hover:text-neutral-100"
    >
      <span aria-hidden className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5">
        ←
      </span>
      {children}
    </Link>
  );
}
