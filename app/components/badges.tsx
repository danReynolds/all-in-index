import { STANCE_META, type CallVerdict } from "@/lib/format";
import type { Stance, Conviction } from "@/lib/types";

/**
 * Whether a call is working — its own clearly-labelled signal. "On track" /
 * "Off track" rather than a final "right/wrong" because these calls are still
 * live. Renders "Too early" inside the ±2% dead zone and "—" when there's no
 * directional call to grade.
 */
export function VerdictTag({ verdict, className = "" }: { verdict: CallVerdict | null; className?: string }) {
  if (!verdict) return <span className={`text-neutral-500 ${className}`}>—</span>;
  if (verdict.right == null)
    return (
      <span title={verdict.label} className={`text-xs text-neutral-500 ${className}`}>
        Too early
      </span>
    );
  return (
    <span
      title={verdict.label}
      className={`text-xs font-medium ${verdict.right ? "text-emerald-400" : "text-rose-400"} ${className}`}
    >
      {verdict.right ? "On track" : "Off track"}
    </span>
  );
}

export function StanceBadge({
  stance,
  className = "",
  tone = "stance",
  outcome,
}: {
  stance: Stance;
  className?: string;
  tone?: "stance" | "neutral" | "outcome";
  outcome?: number | null;
}) {
  const m = STANCE_META[stance];
  const badge =
    tone === "outcome" && outcome != null
      ? outcome >= 0
        ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/25"
        : "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/25"
      : tone === "neutral"
      ? "bg-white/5 text-neutral-300 ring-1 ring-inset ring-white/10"
      : m.badge;
  const dot =
    tone === "outcome" && outcome != null
      ? outcome >= 0
        ? "bg-emerald-500"
        : "bg-rose-500"
      : tone === "neutral"
        ? "bg-neutral-400"
        : m.dot;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
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
