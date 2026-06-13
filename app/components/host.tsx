"use client";

import { useEffect, useRef, useState } from "react";
import { HOST_UI, hostImageUrl } from "@/lib/hosts";
import type { Host } from "@/lib/types";

const SIZES = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-5 w-5 text-[10px]",
  md: "h-7 w-7 text-xs",
  lg: "h-9 w-9 text-sm",
};

export function HostAvatar({ host, size = "md" }: { host: Host; size?: keyof typeof SIZES }) {
  const ui = HOST_UI[host];
  const img = hostImageUrl(host);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // Catch images that died before hydration (onError won't re-fire).
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);

  if (img && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        src={img}
        alt={ui.name}
        title={ui.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`inline-block shrink-0 rounded-full object-cover ring-1 ring-white/20 ${SIZES[size].split(" ").slice(0, 2).join(" ")}`}
      />
    );
  }
  return (
    <span
      title={ui.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${ui.solid} ${SIZES[size]}`}
    >
      {ui.initials}
    </span>
  );
}

/** A row of overlapping host avatars. */
export function HostStack({ hosts, size = "md" }: { hosts: Host[]; size?: keyof typeof SIZES }) {
  const seen = [...new Set(hosts)];
  return (
    <span className="flex -space-x-1.5">
      {seen.map((h) => (
        <span key={h} className="rounded-full ring-2 ring-white dark:ring-neutral-900">
          <HostAvatar host={h} size={size} />
        </span>
      ))}
    </span>
  );
}

export function HostChip({ host }: { host: Host }) {
  const ui = HOST_UI[host];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ui.soft}`}>
      <HostAvatar host={host} size="sm" />
      {ui.name}
    </span>
  );
}
