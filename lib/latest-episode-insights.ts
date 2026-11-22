import { isPortfolioScored, tradeDirectionForTake } from "./calls";
import { REGULAR_HOSTS } from "./types";
import type { EpisodeMeta, Holding, IndexSnapshot, Thesis } from "./types";

type FeaturedCall = {
  holding: Pick<Holding, "slug" | "company" | "domain" | "ticker">;
  take: Thesis;
  speaker: string;
  action: "Long call" | "Short call" | "Exit";
  startMs: number | null;
};

export type LatestEpisodeInsight = {
  episodeId: string;
  episode: EpisodeMeta;
  calls: FeaturedCall[];
};

function rankCalls(a: FeaturedCall, b: FeaturedCall): number {
  return Number(b.take.conviction === "high") - Number(a.take.conviction === "high") ||
    Number(b.take.attributionConfidence === "high") - Number(a.take.attributionConfidence === "high") ||
    a.take.id.localeCompare(b.take.id);
}

function selectSpeakerCall(candidates: FeaturedCall[]): FeaturedCall {
  const timed = candidates.flatMap((call) => call.startMs == null ? [] : [{ call, time: call.startMs }]);
  // When dated evidence conflicts, feature what the speaker said last.
  if (new Set(timed.map(({ call }) => call.action)).size > 1) {
    return timed.sort((a, b) => b.time - a.time || rankCalls(a.call, b.call))[0].call;
  }
  return candidates.sort(rankCalls)[0];
}

/** Select calls from the newest episode, including when it has no featureable calls. */
export function selectLatestEpisodeInsights(snapshot: Pick<IndexSnapshot, "episodes" | "holdings">): LatestEpisodeInsight | null {
  const [latest] = Object.entries(snapshot.episodes ?? {}).sort(
    ([idA, a], [idB, b]) => b.date.localeCompare(a.date) || idA.localeCompare(idB),
  );
  if (!latest) return null;
  const [episodeId, episode] = latest;

  const bySpeakerAndHolding = new Map<string, FeaturedCall[]>();
  for (const holding of snapshot.holdings) {
    for (const take of holding.theses) {
      if (take.episodeId !== episodeId || !isPortfolioScored(take)) continue;
      if (take.conviction !== "medium" && take.conviction !== "high") continue;
      if (take.attributionConfidence !== "medium" && take.attributionConfidence !== "high") continue;
      if (!take.summary.trim() || !take.quote.trim()) continue;

      const speaker = take.host === "Guest"
        ? take.guestName?.trim()
        : REGULAR_HOSTS.includes(take.host) ? take.host : null;
      if (!speaker) continue;

      const direction = tradeDirectionForTake(take);
      const action = take.callType === "explicit_exit" ? "Exit"
        : direction === "long" ? "Long call"
        : direction === "short" ? "Short call"
        : null;
      if (!action) continue;

      const time = take.quoteStartMs;
      const startMs = time != null && Number.isFinite(time) && time >= 0 ? time : null;
      const key = JSON.stringify([holding.slug, take.host, speaker.toLowerCase().replace(/\s+/g, " ")]);
      const candidate: FeaturedCall = { holding, take, speaker, action, startMs };
      const candidates = bySpeakerAndHolding.get(key);
      if (candidates) candidates.push(candidate);
      else bySpeakerAndHolding.set(key, [candidate]);
    }
  }

  const calls = Array.from(bySpeakerAndHolding.values(), selectSpeakerCall).sort(rankCalls).slice(0, 3);
  return { episodeId, episode, calls };
}
