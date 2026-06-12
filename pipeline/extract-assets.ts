import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { snapQuoteTimestamps, stampAttribution } from "./run-episode";
import { ASSETS } from "../lib/assets";
import { REGULAR_HOSTS } from "../lib/types";
import type { Host, Thesis, Transcript } from "../lib/types";

const HOST_VALUES = [...REGULAR_HOSTS, "Guest", "Unknown"] as const;
const ASSET_NAMES = ASSETS.map((a) => a.name);

const SYSTEM = `You extract directional calls on COMMODITIES from All-In podcast transcript excerpts.

Assets in scope (use these exact names): ${ASSET_NAMES.join(", ")}.

A commodity take is a host expressing a view on the PRICE/INVESTMENT direction
of the commodity itself — supply/demand, price trajectory, "the trade is
uranium". It is NOT in scope when they discuss a company that produces or uses
the commodity (that is a company take, handled elsewhere), or when the word
appears incidentally ("Robinhood gold card", "oil and gas executives met...").

The same standards as company takes apply:
- stance is ECONOMIC DIRECTION, EXPLICITLY CLAIMED: bull = the speaker claims
  the price/value is heading up or the asset is the trade; bear = down/at risk.
  Policy commentary about a commodity (e.g. "we need more domestic uranium for
  national security") with no price/investment claim: emit nothing.
- conviction: hedged aside = low; emphatic, repeated, "this is the trade" = high.
- positional: true ONLY for the speaker's own transaction/selection language
  ("I bought gold", "uranium is my pick", "I'd be long copper"). Sentiment
  ("I like gold here") is not positional.
- quote: SHORT verbatim excerpt (<= 240 chars) that CARRIES the evidence for the
  labels. Copy exactly. quoteStartSec from the "[<sec>s <Speaker>]" prefix.
- One take per (host, asset) per episode; merge scattered remarks. Be
  conservative: no substantive directional view -> emit nothing.`;

const Item = z.object({
  asset: z.string(),
  host: z.enum(HOST_VALUES),
  stance: z.enum(["bull", "bear", "neutral", "mixed"]),
  conviction: z.enum(["low", "medium", "high"]),
  // Models occasionally emit "true"/"false" strings — accept both.
  positional: z.union([
    z.boolean(),
    z.enum(["true", "false"]).transform((v) => v === "true"),
  ]),
  summary: z.string(),
  quote: z.string(),
  quoteStartSec: z.number().nullable(),
  topics: z.array(z.string()),
});
const Schema = z.object({ takes: z.array(Item) });

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    takes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          asset: { type: "string", enum: ASSET_NAMES },
          host: { type: "string", enum: [...HOST_VALUES] },
          stance: { type: "string", enum: ["bull", "bear", "neutral", "mixed"] },
          conviction: { type: "string", enum: ["low", "medium", "high"] },
          positional: { type: "boolean" },
          summary: { type: "string" },
          quote: { type: "string" },
          quoteStartSec: { type: ["number", "null"] },
          topics: { type: "array", items: { type: "string" } },
        },
        required: ["asset", "host", "stance", "conviction", "positional", "summary", "quote", "quoteStartSec", "topics"],
      },
    },
  },
  required: ["takes"],
};

/** Keyword-windowed mini-transcript: matching utterances ± one neighbor. */
function assetWindows(tr: Transcript): string {
  const kws = ASSETS.flatMap((a) => a.keywords).map((k) => k.toLowerCase());
  const keep = new Set<number>();
  tr.utterances.forEach((u, i) => {
    const lo = u.text.toLowerCase();
    if (kws.some((k) => lo.includes(k))) {
      keep.add(i - 1);
      keep.add(i);
      keep.add(i + 1);
    }
  });
  if (!keep.size) return "";
  let out = "";
  for (const i of [...keep].sort((a, b) => a - b)) {
    const u = tr.utterances[i];
    if (!u) continue;
    out += `[${Math.round(u.startMs / 1000)}s ${u.speaker}] ${u.text}\n`;
    if (out.length > 14000) break;
  }
  return out;
}

/**
 * Second-pass extraction: commodity calls the company-centric extractor skips.
 * Saves takes into the per-episode theses files (asset name as company, ETF
 * proxy as ticker) — build-index then treats them as holdings; index/funds
 * exclude them via isMacroAsset.
 */
export async function extractAssets(): Promise<void> {
  const proxyOf = new Map(ASSETS.map((a) => [a.name, a.proxy]));
  let created = 0;
  let episodesScanned = 0;

  for (const epId of store.listEpisodeIds()) {
    const tr = store.loadTranscript(epId);
    if (!tr) continue;
    const windows = assetWindows(tr);
    if (!windows) continue;
    episodesScanned++;

    const ep = store.loadEpisode(epId);
    const result = await callTool({
      system: SYSTEM,
      user: `Episode ${epId} — "${ep?.title ?? ""}".\n\nTranscript excerpts:\n\n${windows}`,
      toolName: "submit_asset_takes",
      toolDescription: "Submit commodity takes found in these excerpts.",
      inputSchema: INPUT_SCHEMA,
      validate: Schema,
      maxTokens: 4096,
    });
    if (!result.takes.length) continue;

    const theses = store.loadTheses(epId);
    let changed = false;
    result.takes.forEach((item, i) => {
      const proxy = proxyOf.get(item.asset);
      if (!proxy) return;
      // One take per (host, asset, episode) — never duplicate.
      if (theses.some((t) => t.company === item.asset && t.host === item.host)) return;
      const take: Thesis = {
        id: `${epId}-${proxy.toLowerCase()}-${item.host}-a${i}`,
        episodeId: epId,
        episodeNumber: ep?.number ?? null,
        episodeDate: ep?.date ?? "",
        company: item.asset,
        ticker: proxy,
        isPublic: true,
        host: item.host as Host,
        stance: item.stance,
        conviction: item.conviction,
        positional: item.positional,
        summary: item.summary,
        quote: item.quote,
        quoteStartMs: item.quoteStartSec != null ? item.quoteStartSec * 1000 : null,
        topics: item.topics,
      };
      theses.push(take);
      changed = true;
      created++;
      console.log(`  + ${epId} ${item.host} ${item.stance}/${item.conviction} on ${item.asset}${item.positional ? " 📌" : ""}`);
    });
    if (changed) {
      snapQuoteTimestamps(theses, tr);
      stampAttribution(theses, tr);
      store.saveTheses(epId, theses);
    }
  }
  console.log(`\n✓ scanned ${episodesScanned} episodes with commodity talk, created ${created} takes.`);
  console.log("Run build-index to attach market data and surface them.");
}
