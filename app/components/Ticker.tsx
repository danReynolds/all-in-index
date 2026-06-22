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
    <div
      className="ticker-shell ticker-mask overflow-hidden border-b border-white/5 bg-neutral-950/60"
      aria-label="Index constituents — return since the call"
    >
      {/* No flex `gap` or track padding: each item carries its own trailing
          margin (mr-7) so the two copies tile to exactly 50% of the track and
          the -50% loop is seamless. Gap/padding here would offset that point
          and make the tape visibly hop once per loop. */}
      <div className="ticker-track flex w-max items-center py-1.5">
        {loop.map((it, i) => {
          // The second copy exists only for the seamless CSS loop — hide it from
          // screen readers and the tab order so the ticker isn't announced twice.
          const dup = i >= items.length;
          return (
          <Link
            key={`${it.slug}-${i}`}
            href={`/holding/${it.slug}`}
            aria-hidden={dup || undefined}
            tabIndex={dup ? -1 : undefined}
            className="mr-7 flex shrink-0 items-baseline gap-1.5 font-mono text-[11px] tabular-nums tracking-tight"
          >
            <span className="text-neutral-400">{it.ticker}</span>
            <span className={it.ret >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {it.ret >= 0 ? "▲" : "▼"} {(Math.abs(it.ret) * 100).toFixed(1)}%
            </span>
          </Link>
          );
        })}
      </div>
    </div>
  );
}
