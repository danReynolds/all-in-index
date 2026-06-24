import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getHolding, allSlugs, guestLinkMap } from "@/lib/data";
import { pct, returnColor, fmtDate, fmtDuration, fmtMoney, daysBetween } from "@/lib/format";
import { currentCall, scoredTakes, holdingBadge, hasScoredCall, isScoredPosition, shortReturn, callReturnFromStockMove } from "@/lib/calls";
import { isMacroAsset, proxyAssetKind } from "@/lib/assets";
import { isGoingPrivate } from "@/lib/tradability";
import { StanceBadge, ConvictionDots, SampleBanner } from "@/app/components/badges";
import { Explainer } from "@/app/components/Explainer";
import { Sparkline } from "@/app/components/Sparkline";
import { HostAvatar, HostStack } from "@/app/components/host";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { Timeline } from "@/app/components/Timeline";
import { PriceChart } from "@/app/components/PriceChart";
import { Reveal } from "@/app/components/Reveal";
import { BackLink } from "@/app/components/BackLink";
import { HashScroll } from "@/app/components/HashScroll";
import type { Host, Thesis } from "@/lib/types";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { holding: h } = getHolding(slug);
  if (!h) return { title: "Not found" };
  const since = h.market?.returns.since;
  const badge = holdingBadge(h.theses);
  const facts: string[] = [];
  if (badge.scored) facts.push(`currently ${badge.stance}`);
  if (since != null)
    facts.push(`stock ${(since >= 0 ? "+" : "") + (since * 100).toFixed(1)}% since first discussed`);
  const factLine = facts.length
    ? ` ${facts.join("; ").replace(/^./, (c) => c.toUpperCase())}.`
    : "";
  return {
    title: `${h.company}${h.ticker ? ` (${h.ticker})` : ""} — what the besties said`,
    description: `${h.description ?? `${h.mentionCount} takes from the All-In hosts.`}${factLine} Every quote sourced and timestamped.`,
    alternates: { canonical: `/holding/${slug}` },
  };
}

const HOST_ORDER: Host[] = ["Chamath", "Jason", "Sacks", "Friedberg", "Guest", "Unknown"];

// Canonical SCORED take: medium+ conviction, verified speaker. The same set the
// stance/index/flip count use, so "Where they stand now" and the timeline's
// default view stay consistent with the flip badge above them.
function isDefaultHoldingTake(t: Thesis): boolean {
  return t.attributionConfidence !== "low" && t.conviction !== "low";
}

function defaultHoldingTakes(takes: Thesis[]): Thesis[] {
  const filtered = takes.filter(isDefaultHoldingTake);
  return filtered.length > 0 ? filtered : takes;
}

function callCount(n: number): string {
  return `${n} key ${n === 1 ? "call" : "calls"}`;
}

function mentionCount(n: number): string {
  return `${n} ${n === 1 ? "mention" : "mentions"}`;
}

function groupByHost(theses: Thesis[]): Array<{ host: Host; takes: Thesis[]; flips: number }> {
  const map = new Map<Host, Thesis[]>();
  for (const t of theses) {
    (map.get(t.host) ?? map.set(t.host, []).get(t.host)!).push(t);
  }
  return HOST_ORDER.filter((h) => map.has(h)).map((host) => {
    const takes = map.get(host)!.slice().sort((a, b) => a.episodeDate.localeCompare(b.episodeDate));
    // A flip = a direction reversal in the collapsed bull/bear journey of the
    // host's scored (medium+ conviction) takes — same definition as the Insights
    // Flip Tracker and the "Following their calls" stat, so counts agree sitewide.
    const dirs = takes
      .filter((t) => t.conviction !== "low" && t.attributionConfidence !== "low")
      .map((t) => t.stance)
      .filter((s) => s === "bull" || s === "bear");
    const collapsed = dirs.filter((s, i) => i === 0 || s !== dirs[i - 1]);
    const flips = Math.max(0, collapsed.length - 1);
    return { host, takes, flips };
  });
}

export default async function HoldingPage({ params }: PageProps<"/holding/[slug]">) {
  const { slug } = await params;
  const { holding: h, isSample, episodeLinks, episodes, indexPosition, bearPosition } = getHolding(slug);
  if (!h) notFound();
  const guestLinks = guestLinkMap();

  const hostGroups = groupByHost(h.theses);
  const totalFlips = hostGroups.reduce((n, g) => n + g.flips, 0);
  // Performance/returns UI is gated on an actual scored call — a name they only
  // commented on has no position to score, so it shows no up/down numbers.
  const hasCall = hasScoredCall(h.theses);
  const marketAsOfMs = h.market ? Date.parse(`${h.market.asOf}T00:00:00Z`) : null;
  const yahooSymbol = h.market?.sourceSymbol ?? h.ticker;
  const macro = isMacroAsset(h.ticker);
  const proxyKind = proxyAssetKind(h.ticker);
  const goingPrivate = isGoingPrivate(h.ticker);

  return (
    <div className="space-y-8">
      <HashScroll />
      <BackLink href="/">All holdings</BackLink>

      <header className="rise space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <CompanyLogo name={h.company} domain={h.domain} size="lg" />
          <h1 className="font-display text-3xl font-bold tracking-tight">{h.company}</h1>
          {h.ticker ? (
            <span className="rounded bg-neutral-100 px-2 py-1 font-mono text-sm text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
              {h.ticker}
            </span>
          ) : (
            <span className="rounded border border-neutral-200 px-2 py-1 text-sm text-neutral-400 dark:border-neutral-700">
              private
            </span>
          )}
          {(() => {
            const b = holdingBadge(h.theses);
            return <StanceBadge stance={b.stance} scored={b.scored} />;
          })()}
        </div>
        {h.description && (
          <p className="max-w-2xl text-sm text-neutral-400">
            {h.description}
            <span className="ml-2 inline-flex gap-3 whitespace-nowrap">
              {yahooSymbol && (
                <a
                  href={`https://finance.yahoo.com/quote/${yahooSymbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  Yahoo Finance ↗
                </a>
              )}
              {h.domain && (
                <a
                  href={`https://${h.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {h.domain} ↗
                </a>
              )}
            </span>
          </p>
        )}
        {macro && (
          <p className="text-xs text-neutral-500">
            {proxyKind === "crypto" ? "A crypto asset" : proxyKind === "sector" ? "A sector/theme exposure" : "A commodity"}, not a company — priced via the{" "}
            <span className="font-mono text-neutral-400">{h.ticker}</span> ETF as a clean proxy.
            Excluded from the index and host funds.
          </p>
        )}
        {goingPrivate && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Going private — under a definitive cash take-private. Public holders are cashed out at
            the deal price, so the stock is pinned near it and there&apos;s no forward performance to
            track; the bull case is about the company&apos;s private future. Excluded from the index
            and host funds.
          </p>
        )}
        <p className="text-sm text-neutral-500">
          {h.mentionCount} {h.mentionCount === 1 ? "take" : "takes"} · first discussed{" "}
          {fmtDate(h.firstMentioned)}
          {h.lastMentioned !== h.firstMentioned && <> · last {fmtDate(h.lastMentioned)}</>}
          {totalFlips > 0 && (
            <>
              {" "}
              ·{" "}
              <span className="font-medium text-neutral-600 dark:text-neutral-300">
                {totalFlips} stance {totalFlips === 1 ? "reversal" : "reversals"}
              </span>
            </>
          )}
        </p>
        {(() => {
          // A name discussed while still private (e.g. SpaceX pre-IPO) has no
          // priced return until it lists — say so, so the call date isn't read
          // as the start of the measured window.
          const firstPrice = h.market?.history[0]?.[0];
          if (!firstPrice || daysBetween(h.firstMentioned, firstPrice) <= 120) return null;
          return (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400/90">
              Private when first discussed — performance is tracked from {fmtDate(firstPrice)}, its first public price.
            </p>
          );
        })()}
      </header>

      {isSample && <SampleBanner />}

      {/* Full-width stat band: performance only when there's a scored call;
          otherwise the no-numbers "where they land" band (sentiment + who weighed in). */}
      {h.market && hasCall ? (
        <section className="rise flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl border border-neutral-200 bg-white px-6 py-5 dark:border-neutral-800 dark:bg-neutral-900" style={d(120)}>
          {(() => {
            // Headline = what their CURRENT call is worth, anchored to when that
            // stance was adopted (not the first mention). For names the index /
            // Bear Book hold, use their exact daily-close numbers so this matches
            // the ticker; otherwise fall back to the (sampled) currentCall.
            const cc = currentCall(h);
            const directional = cc && (cc.stance === "bull" || cc.stance === "bear");
            const call =
              directional && indexPosition
                ? { dir: "bull" as const, ret: indexPosition.sinceReturn, entryDate: indexPosition.entryDate, p0: indexPosition.entryPrice, p1: indexPosition.latestPrice }
                : directional && bearPosition
                  ? { dir: "bear" as const, ret: shortReturn(bearPosition.sinceReturn), entryDate: bearPosition.entryDate, p0: bearPosition.basePrice, p1: bearPosition.latestPrice }
                  : directional && cc!.ret != null
                    ? { dir: cc!.stance, ret: callReturnFromStockMove(cc!.stance, cc!.ret)!, entryDate: cc!.sinceDate, p0: null as number | null, p1: null as number | null }
                    : null;
            const staleBadge = (() => {
              const scored = scoredTakes(h.theses);
              if (!scored.length || marketAsOfMs == null) return null;
              const age = Math.round((marketAsOfMs - Date.parse(scored[scored.length - 1].episodeDate)) / 86400000);
              return age > 90 ? (
                <span className="ml-1.5 text-amber-600 dark:text-amber-400" title="No scored take on this name since — the stance behind this call may be stale.">
                  · stance {age}d old
                </span>
              ) : null;
            })();
            if (!call) {
              // No directional current stance (mixed / neutral / no scored take):
              // fall back to plain price-since-first-discussed.
              return (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">Price since first discussed</div>
                  <div className={`font-display text-5xl font-bold tabular-nums ${returnColor(h.market!.returns.since)}`}>{pct(h.market!.returns.since)}</div>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    {fmtMoney(h.market!.basePrice, h.market)} → {fmtMoney(h.market!.latestPrice, h.market)}{staleBadge}
                  </div>
                </div>
              );
            }
            return (
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
                  Since their {call.dir === "bull" ? "bullish" : "bearish"} call
                </div>
                <div className={`font-display text-5xl font-bold tabular-nums ${returnColor(call.ret)}`}>{pct(call.ret)}</div>
                <div className="mt-0.5 text-xs text-neutral-400">
                  {call.p0 != null && call.p1 != null && <>{fmtMoney(call.p0, h.market)} → {fmtMoney(call.p1, h.market)} · </>}
                  since {fmtDate(call.entryDate)}{staleBadge}
                </div>
                {h.firstMentioned.slice(0, 10) < call.entryDate.slice(0, 10) && (
                  <div className="mt-1 text-xs text-neutral-500" title="The stock's total move since the besties first started discussing this name — context for the call above, not a call return.">
                    Stock {pct(h.market!.returns.since)} since first discussed {fmtDate(h.firstMentioned)}
                  </div>
                )}
              </div>
            );
          })()}
          <div className="ml-auto flex flex-col items-end gap-1">
            <Sparkline points={h.market.history.map(([, c]) => c)} width={170} height={48} />
            <span className="text-[11px] text-neutral-400">
              since first discussed · {fmtDuration(h.market.anchorDate, h.market.asOf)}
            </span>
            {h.market.currency && h.market.currency !== "USD" && (
              <span
                className="text-[10px] font-medium text-amber-600 dark:text-amber-400/90"
                title={`This stock trades in ${h.market.currency}. The return is measured in local currency and compared to the USD S&P — it is not FX-adjusted, so a US investor's return would differ by the ${h.market.currency}/USD move.`}
              >
                priced in {h.market.currency} · not FX-adjusted
              </span>
            )}
          </div>
        </section>
      ) : (
        <section className="rise flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-5 dark:border-neutral-700 dark:bg-neutral-900/50" style={d(120)}>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">Where they land</div>
            <div className="mt-1">
              {(() => {
                const b = holdingBadge(h.theses);
                return <StanceBadge stance={b.stance} scored={b.scored} />;
              })()}
            </div>
          </div>
          <div className="hidden h-12 w-px bg-neutral-200 sm:block dark:bg-neutral-800" />
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">Who&apos;s weighed in</div>
            <div className="mt-1.5"><HostStack hosts={h.theses.map((t) => t.host)} size="sm" /></div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">Takes</div>
            <div className="text-lg font-semibold tabular-nums">{h.mentionCount}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">First discussed</div>
            <div className="text-lg font-semibold">{fmtDate(h.firstMentioned)}</div>
          </div>
          <p className="ml-auto max-w-[280px] text-right text-xs text-neutral-400">
            {h.market
              ? "Commentary only — they've discussed this name but haven't made a call on it, so we don't attribute any call return to it. The stock's price chart and the takes are below."
              : h.ticker
                ? "No live market data available for this ticker — likely delisted, renamed, or unsupported by the current price source. We still track what they said."
                : "Private company — no public price to score. We track what they said; valuation-mark tracking is on the roadmap."}
          </p>
        </section>
      )}

      <div className="space-y-6">
        <div className="space-y-6">
          {/* The price chart shows for any name with market data; on a
              commentary-only name it's the stock's history (mentions, not calls). */}
          {h.market && h.market.history.length > 1 && (
            <section className="rise rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900" style={d(220)}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    {hasCall ? "How the calls played out" : "How the stock has moved"}
                  </h2>
                  <p className="mt-1 text-xs text-neutral-400">
                    {hasCall
                      ? "Click a call to see the price move since it aired."
                      : "The price since they started discussing it. Click a mention to see where it stood — these are comments, not calls."}
                  </p>
                </div>
                <span className="text-[11px] text-neutral-500">
                  prices through {fmtDate(h.market.asOf)}
                </span>
              </div>
              <PriceChart history={h.market.history} theses={h.theses} ticker={h.ticker!} market={h.market} episodeLinks={episodeLinks} episodes={episodes} guestLinks={guestLinks} />
            </section>
          )}

          {/* Where they stand now */}
          <Reveal stagger>
          <section className="space-y-3">
            <h2 className="stagger-item text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Where they stand now
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {hostGroups.map(({ host, takes }, i) => {
                const defaultTakes = defaultHoldingTakes(takes);
                const latest = defaultTakes[defaultTakes.length - 1];
                const hiddenCount = takes.length - defaultTakes.length;
                return (
                  <a
                    key={host}
                    href={`#takes-${host.toLowerCase()}`}
                    style={d(60 + i * 70)}
                    className="group stagger-item card-lift rounded-xl border border-neutral-200 bg-white p-4 hover:border-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <HostAvatar host={host} size="md" />
                        <span className="font-semibold">{host === "Guest" ? "Guests" : host}</span>
                      </div>
                      <StanceBadge stance={latest.stance} callType={latest.callType} scored={isScoredPosition(latest)} />
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-neutral-700 dark:text-neutral-300">
                      {latest.summary}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
                      <span className="flex items-center gap-2">
                        <ConvictionDots conviction={latest.conviction} />
                        {latest.episodeNumber ? `E${latest.episodeNumber}` : latest.episodeId} ·{" "}
                        {fmtDate(latest.episodeDate)}
                      </span>
                      <span className="font-medium transition-colors group-hover:text-emerald-400">
                        {hiddenCount > 0
                          ? `${callCount(defaultTakes.length)} · ${mentionCount(takes.length)}`
                          : takes.length === 1
                            ? "1 call"
                            : `${takes.length} calls`} ↓
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
          </Reveal>

          {/* Synthesis */}
          <Reveal>
          <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              The discussion
            </h2>
            <p className="leading-relaxed text-neutral-800 dark:text-neutral-200">{h.synthesis}</p>
          </section>
          </Reveal>

          {/* How they got there */}
          <Reveal>
          <section className="space-y-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              How they got there
            </h2>
            {hostGroups.map(({ host, takes }) => (
              <article
                key={host}
                id={`takes-${host.toLowerCase()}`}
                className="scroll-mt-28 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {host !== "Guest" && host !== "Unknown" ? (
                      <Link
                        href={`/host/${host.toLowerCase()}`}
                        className="flex items-center gap-2 hover:underline"
                        title={`${host}'s full track record`}
                      >
                        <HostAvatar host={host} size="md" />
                        <span className="font-semibold">{host}</span>
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2">
                        <HostAvatar host={host} size="md" />
                        <span className="font-semibold">{host === "Guest" ? "Guests" : host}</span>
                      </span>
                    )}
                    <span className="text-xs text-neutral-400">
                      {mentionCount(takes.length)} since {fmtDate(takes[0].episodeDate)}
                    </span>
                  </div>
                </div>
                <Timeline theses={takes} episodeLinks={episodeLinks} episodes={episodes} guestLinks={guestLinks} />
              </article>
            ))}
            <Explainer summary="About these quotes">
              Quotes are machine-transcribed from the episode audio — use the Listen links to
              verify any take against the source, or the ⚑ link to report a problem. Takes marked
              unverified, low-conviction, or commentary-only never move stances, the index, or the
              funds.
            </Explainer>
          </section>
          </Reveal>
        </div>

      </div>
    </div>
  );
}
