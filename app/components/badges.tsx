import { STANCE_META } from "@/lib/format";
import type { Stance, Conviction } from "@/lib/types";

export function StanceBadge({ stance, className = "" }: { stance: Stance; className?: string }) {
  const m = STANCE_META[stance];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${m.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export function ConvictionDots({ conviction }: { conviction: Conviction }) {
  const filled = conviction === "high" ? 3 : conviction === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-0.5" title={`${conviction} conviction`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < filled ? "bg-neutral-700 dark:bg-neutral-300" : "bg-neutral-300 dark:bg-neutral-700"
          }`}
        />
      ))}
    </span>
  );
}

export function SampleBanner() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
      <strong>Illustrative sample data.</strong> These are placeholder positions —{" "}
      <em>not real quotes or statements</em>. Add API keys and run{" "}
      <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">npm run pipeline run --number 274</code>{" "}
      to populate real, sourced theses. Market figures shown are real.
    </div>
  );
}
