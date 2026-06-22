import { STANCE_META, SENTIMENT_META, type CallVerdict } from "@/lib/format";
import type { Stance, Conviction, CallType } from "@/lib/types";

export function StanceBadge({
  stance,
  className = "",
  tone = "stance",
  outcome,
  verdict,
  callType,
  scored,
  sentiment = false,
}: {
  stance: Stance;
  className?: string;
  tone?: "stance" | "neutral" | "outcome";
  outcome?: number | null;
  /**
   * When set to a decided call, the leading dot is swapped for a trailing ✓/✗
   * in the badge's own text color — the glyph carries right/wrong without a
   * second color fighting the stance.
   */
  verdict?: CallVerdict | null;
  /**
   * The take's callType, when this badge represents a single take. Used as a
   * fallback signal for commentary when `scored` isn't supplied.
   * Omitted for aggregate/derived stances, which keep their stance label.
   */
  callType?: CallType | null;
  /**
   * Whether THIS take is a portfolio-scored position. When provided, it's
   * authoritative: a take that isn't a scored bull/bear position reads
   * "Commentary", never "Bullish"/"Bearish" — so a bullish *opinion* never
   * looks like a tracked call. Omit for aggregate/derived stances.
   */
  scored?: boolean;
  /**
   * On discussion surfaces (the chart's comment detail), pair "Commentary" with
   * the take's sentiment — "Commentary · Positive" — so a single glance shows
   * it's not a scored call *and* which way it leaned. The pill stays gray so it
   * never reads as a position; only the dot + trailing lean carry colour.
   */
  sentiment?: boolean;
}) {
  // Bullish/Bearish is reserved for a scored POSITION; anything else is
  // "Commentary" (its actual lean lives in the take's words, not a label that
  // could fight the extraction's stance tag). `scored` is authoritative when
  // given; otherwise a "view" callType counts as commentary (aggregate badges
  // pass neither and keep their stance).
  const isUnscoredTake = scored === false || (scored === undefined && callType === "view");
  const commentary = isUnscoredTake && tone === "stance" && verdict == null && outcome == null;
  if (commentary) {
    // With `sentiment`, the colour *is* the label: "Commentary" + its dot take the
    // lean's hue (positive/negative/mixed); the pill stays gray-bodied so it never
    // reads as a position. "neutral" has no lean, so it stays plain. The tooltip
    // spells the lean out for clarity + colorblind users.
    const sm = SENTIMENT_META[stance];
    const lean = sentiment && (stance === "bull" || stance === "bear" || stance === "mixed");
    return (
      <span
        title={lean ? `${sm.label.toLowerCase()} commentary` : undefined}
        className={`inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-white/10 ${lean ? sm.text : "text-neutral-400"} ${className}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${lean ? sm.dot : "bg-neutral-500"}`} />
        Commentary
      </span>
    );
  }
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
  const showVerdict = verdict != null && verdict.right != null;
  return (
    <span
      title={showVerdict ? verdict!.label : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge} ${className}`}
    >
      {!showVerdict && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {m.label}
      {showVerdict && (
        <span className="font-semibold opacity-90">{verdict!.right ? "✓" : "✗"}</span>
      )}
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
