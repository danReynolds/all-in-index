import Link from "next/link";

export interface TickerItem {
  slug: string;
  ticker: string;
  ret: number;
}

/** Scrolling ticker of the index's positions — pure CSS, pauses on hover. */
export function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  // Duplicate the list so the -50% translate loops seamlessly.
  const loop = [...items, ...items];
  return (
    <div className="ticker-shell ticker-mask overflow-hidden border-b border-white/5 bg-neutral-950/60">
      <div className="ticker-track flex w-max items-center gap-7 px-6 py-1.5">
        {loop.map((it, i) => (
          <Link
            key={`${it.slug}-${i}`}
            href={`/holding/${it.slug}`}
            className="flex shrink-0 items-baseline gap-1.5 font-mono text-[11px] tabular-nums tracking-tight"
          >
            <span className="text-neutral-400">{it.ticker}</span>
            <span className={it.ret >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {it.ret >= 0 ? "▲" : "▼"} {(Math.abs(it.ret) * 100).toFixed(1)}%
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
