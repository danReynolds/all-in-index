"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/the-index", label: "The Index" },
  { href: "/signals", label: "Signals" },
  { href: "/awards", label: "Awards" },
  { href: "/episodes", label: "Episodes" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-0.5 text-xs sm:gap-1 sm:text-sm">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-full px-2 py-1.5 transition-colors sm:px-3 ${
              active
                ? "bg-emerald-500/10 font-medium text-emerald-400"
                : "text-neutral-400 hover:text-neutral-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
