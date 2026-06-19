import { z } from "zod";
import { callTool } from "./llm";
import { verifyTheses } from "./verify";
import { trimPublishedQuote } from "../lib/quotes";
import { REGULAR_HOSTS } from "../lib/types";
import { SECTOR_PROXY_PROMPT, SECTOR_PROXY_TICKER_VALUES } from "../lib/proxies";
import type { Episode, Thesis, Transcript, Host } from "../lib/types";

const HOST_VALUES = [...REGULAR_HOSTS, "Guest", "Unknown"] as const;
const CALL_TYPE_VALUES = ["view", "explicit_long", "explicit_short", "explicit_exit", "selection", "pair_trade", "basket"] as const;
const EXCLUDE_REASON_VALUES = ["conditional", "not_investment_call", "day_trade_aside"] as const;

const ThesisItemSchema = z.object({
  company: z.string(),
  ticker: z.string().nullable(),
  isPublic: z.boolean(),
  host: z.enum(HOST_VALUES),
  stance: z.enum(["bull", "bear", "neutral", "mixed"]),
  conviction: z.enum(["low", "medium", "high"]),
  callType: z.enum(CALL_TYPE_VALUES),
  excludeReason: z.enum(EXCLUDE_REASON_VALUES).nullable().optional(),
  scoreNote: z.string().nullable().optional(),
  sectorProxy: z.string().nullable().optional(),
  summary: z.string(),
  quote: z.string(),
  quoteStartSec: z.number().nullable(),
  topics: z.array(z.string()),
});

const ExtractionSchema = z.object({
  theses: z.array(ThesisItemSchema),
});

const SYSTEM = `You extract INVESTMENT theses about specific companies, named baskets/sectors, and explicit macro exposures from All-In podcast transcripts.

A "thesis" is a host expressing a view about a company's value AS AN INVESTMENT — would you want to own the stock? Is it over- or under-valued? Are its business/competitive/financial prospects improving or deteriorating in a way that affects equity value?

Also extract explicit, named investment calls on a non-company exposure when the host's own words make it a pick/trade: broad-market indexes ("short the S&P"), sector baskets ("software industrial complex", "capital equipment"), crypto/stablecoin sectors, credit default swaps/CDS, or other named asset classes. Use ticker=null and isPublic=false unless there is a clear listed ETF/equity proxy already named in the transcript. These are structurally excluded from company funds later, but they must still be recorded when the host made a real pick/trade.

This is the critical filter — read it carefully:
- COUNTS (investment-relevant): valuation calls, growth/revenue/margin trajectory, competitive moat or threat, would-buy/would-sell/would-hold, "this is cheap/expensive," product/market position as it affects the stock.
- Does NOT count (skip entirely — do not emit a thesis): social, political, ethical, cultural, or personality commentary that does NOT bear on equity value. Examples to SKIP: criticizing a company's layoff messaging or ethics, disliking a CEO's tweet, drama/gossip, regulatory opinions with no stated value impact.
- Stance reflects the INVESTMENT view, never approval/disapproval of behavior. A host can think a company behaved badly while staying bullish on the stock — and vice versa. If they only criticize conduct and say nothing about the stock's value, emit NOTHING for that company.
  Example: "Jason thinks Meta recording employees is dystopian" → this is commentary, NOT a bearish thesis. Do not emit it.
- NEWS/EVENT REACTIONS are not theses. Praising or criticizing a single deal, acquisition, earnings report, product launch, hire, or contract is a reaction to an EVENT — not a view on the company as an investment — unless the speaker explicitly extends it into a forward-looking claim about the company's value, trajectory, or competitive position.
  The litmus test: is this a forward-looking claim the speaker would put money behind, or applause/booing for a news item?
  Do NOT emit: "Chamath highlights Boeing's $160B Qatar deal as a major commercial win" — cheering a transaction; says nothing about whether the company is a good investment.
  DO emit (bull): "Sacks cites Anthropic's 50%+ coding-token share as evidence it has become the dominant AI coding platform" — evidence deployed in service of a forward competitive claim.
  DO emit (bear): "Chamath argues Boeing's failures stem from a culture that prioritized EPS over safety, making it structurally broken" — a durable, forward-looking judgment about the business.
- Earnings reactions follow the same rule: "great quarter" alone is commentary; it becomes a thesis only when tied forward ("...and this proves Search survives the AI transition").
- MACRO BAROMETER mentions are not company theses. When a company is invoked as EVIDENCE or a DATA POINT for a claim about the broader economy, the consumer, interest rates, or the market — not about itself — the real subject is that macro trend, and the company is just the thermometer. Emit NOTHING for it (or neutral if the host separately makes a forward company-specific claim).
  Do NOT emit (bear): "Airbnb had a massive warning on demand, which shows the consumer is weak / a recession is coming" or "Airbnb's stock fell 15% on soft demand — that's consumer weakness" — Airbnb is a recession bellwether here; the claim is about the consumer, not Airbnb's own trajectory. A company-specific bear needs a forward claim about THAT company's economics (e.g. "Airbnb is being re-rated from a tech multiple to a cyclical-consumer multiple, so its valuation compresses").
- PRODUCT PRAISE, SHOUT-OUTS, AND PERKS are not theses. Loving a product, thanking a company for a gift or perk, plugging a sponsor, or sharing a consumer experience says nothing about the stock.
  Do NOT emit: "Chamath thanked Robinhood for sending him their gold card" — gratitude for swag, not an investment view. Do not launder it into "implicitly endorsing" anything.
  DO emit (bull): "Jason argues Robinhood's product velocity is winning the consumer brokerage market" — product observation deployed in service of a competitive claim about the business.
  BUYING OR USING THE PRODUCT IS NOT A POSITION. Purchasing a company's product — a car, a device, a subscription — or being a happy customer is a CONSUMER act, never an equity position, and never an "explicit_long". Only buying the STOCK / SHARES is a long.
  Do NOT emit explicit_long: "we bought two more Model Xs", "I switched to their app", "I'm a happy customer" — these are product purchases. (A forward claim built on that experience can still be a bull VIEW or a selection, but not a buy of the stock.)
  DO emit explicit_long: "I just bought the stock", "I bought LNG, that Cheniere company", "I'm a shareholder" — an actual equity position.
- NON-EQUITY ASSET TRANSACTIONS are not scoreable calls. Buying or selling a sports franchise/team, real estate, art, collectibles, or another personal non-equity holding is not an investment call on a tradable security — emit a view at most, never a scored explicit_long/short/exit.
  Do NOT emit (exit): "Cuban sold most of the Mavericks" — a private franchise sale, not an equity exit. (Commodities, named macro/sector exposures, and investable private COMPANIES are different — those still count when the host makes a real pick/trade.)
- PREDICTION-MARKET & MARKET-STRUCTURE BETS are not equity positions. A wager on a prediction market (Polymarket, Kalshi), or on a market-STRUCTURE outcome — an index's composition or weight, "the Mag 7 shrinks below 30% of the S&P", "X happens by year-end" — is not a long or short of any stock or ETF. Do NOT score it as a selection/long/short on the named companies (the Mag 7 can rise in price while shrinking as a share of the index). Emit a view at most.
- SECTOR/THEME HALO is not a company thesis. A directional view of an industry, trend, or theme ("AI is a force multiplier for cybersecurity", "chip demand is exploding", "ad budgets are shifting to streaming") does NOT make every company named as a member of that sector a bull or bear. Companies named only as EXAMPLES of a category are enumerated mentions, not per-company theses.
  Do NOT emit: "Sacks: get these AI tools in the hands of our cybersecurity industry, not just the public companies like Palo Alto Networks and CrowdStrike" — both companies are named as examples of an industry; neither gets its own claim. Emit NOTHING for either, however bullish the surrounding theme sounds.
  Do NOT emit: "you have Nvidia, you have AMD, you have the whole chip complex riding this wave" — enumerated members of a theme, not per-company theses.
  A company named inside a sector/theme statement earns a thesis ONLY when the host gives THAT specific company its own explicit, company-level economic claim ("...and Palo Alto specifically is taking share because its platform bundle is winning").

Rules:
- Extract one thesis per (host, company) per episode. Merge a host's scattered remarks about the same company into a single, faithful thesis.
- Attribute each thesis to the host who actually holds the view, using the speaker labels in the transcript. If two hosts express distinct views on the same company, produce one thesis each.
  QUOTE OWNERSHIP: the quote you cite MUST be spoken by the attributed host — its transcript line's "[<sec>s <Speaker>]" prefix must name that host. Never attach another speaker's sentence to this host's thesis, and never stitch words from two different speakers into one quote, even when someone else phrased the idea more vividly. If a moderator says "Chamath, what's your pick?" but the next transcript line is "[123s Friedberg]", attribute the answer to Friedberg; the line prefix controls. If only another person said the proving sentence, either quote the attributed host's OWN (possibly weaker) words or, if this host never made the claim themselves, drop the take.
- stance: "bull" (positive/long), "bear" (negative/short/skeptical), "neutral" (balanced/uncertain), or "mixed" (explicitly both sides).
  STANCE IS ECONOMIC DIRECTION, NOT APPROVAL — and the direction must be EXPLICITLY CLAIMED, never inferred. bull = the speaker claims the company's economic position or value is improving; bear = the speaker ties a concrete risk to the company's economics.
  All of these are NEUTRAL, not directional:
  - moral or policy disapproval of conduct ("they're pursuing regulatory capture to lock in monopolistic control") — even though a monopoly would be economically good for them;
  - condemnation of a company's ETHICS, TRUSTWORTHINESS, or societal/ecosystem impact ("they surveil every prompt", "they're an untrustworthy / dangerous actor", "their restrictions hurt the open-source ecosystem") — disapproval of behavior is not a claim the business will do worse, and anti-competitive / regulatory-capture / lock-in behavior is often economically GOOD for the company;
  - describing a strategy as effective ("once rivals are gone they can raise the price of the bundle") — conduct commentary, unless the speaker says the business itself is strengthening;
  - morally-framed risk with no explicit economic tie ("they're circumventing export controls and 47% of revenue is China") — criticism of conduct, not a claimed revenue risk;
  - approving a policy or deal as good for outsiders ("the government taking equity is a better deal for taxpayers") — not a claim about the company's prospects.
  A take is BEAR only when the criticism is EXTENDED to a worse business outcome — lost customers, revenue, margins, share, or competitive position. Contrast: "Anthropic surveils prompts and is engaged in regulatory capture" is a NEUTRAL conduct critique (the behavior may even entrench them); "...so enterprises treat it as a non-starter and flee to open-source" is BEAR, because it claims lost customers. Likewise "Apple's 30% fee is the prime antitrust target" is bear only because it ties a legal threat to a named revenue stream.
  A company you describe as WINNING — growing fast, gaining share, entrenching monopolistic control, pulling away from rivals — is bull or neutral, NEVER bear, even if the speaker frames that winning as dangerous, unfair, or untrustworthy ("Anthropic's regulatory capture entrenches its monopolistic control" → not bear).
  THE STANCE MUST BE ABOUT THE COMPANY THE TAKE NAMES — not a different company nearby in the same sentence. When a host is cautious/negative on company X but bullish on the BENEFICIARIES of X (X's suppliers, customers, or whoever receives X's spending — "I'm not sure there's a valuation case for the hyperscalers; follow the trillion dollars going OUT of them and buy THOSE companies"), the bullish call belongs to the beneficiaries, NOT to X. Do not emit a bull take on X off such a statement; if the beneficiaries aren't named as specific tickers, emit nothing rather than a misdirected bull on X.
  If the economic direction is not explicitly claimed, use "neutral".
- conviction: how strongly the host commits (hedged aside = low; emphatic, repeated, "this is the trade" = high).
- callType: classify what kind of statement this is. This single field decides whether the take is scored — there is no separate flag.
  - "view" — commentary, analysis, or sentiment with NO portfolio action. This is the DEFAULT and most takes are views. A strong opinion is still a view: "I'm bullish", "exceptional business", "they're toast", "outstanding position to do X", "you could buy it too, I guess" are all views. Being well-positioned, cheap, or well-run is an observation about the company, not the speaker's own call.
  - "explicit_long" — the speaker states their own buy/own/long OF THE STOCK: "I'm in", "I have shares", "I just bought", "I'd own it here", "I'd be long X", "this is the trade", "probably a buying opportunity". Buying the company's PRODUCT (a car, device, subscription) is not this — only an equity position counts.
  - "explicit_short" — the speaker states a short: "this is a short", "I'm short", "the short here is X".
  - "explicit_exit" — clear close/avoid that exits WITHOUT opening a short: "I'd take profits", "I'm out", "wouldn't touch it". (Criticizing a company someone might still hold is NOT an exit — that's a view.)
  - "selection" — a named pick in answer to a positioning, allocation, or predictions prompt. This covers the obvious ranked pick ("my pick is X", "my #1 is X", "biggest business winner/loser is X", "best/worst performing asset is X", "best place to invest", "I will pick X"; and prompts like "which would you bet on?" / "top picks?" / "biggest winner or loser?" / "best or worst asset?"), AND the contextual case: when the host is answering "how would you reposition? / where would you put money? / what would you own or avoid here?", the exposure they name to OWN/BUY is a bull selection and the one they name to AVOID/STAY-AWAY-FROM is a bear selection — first-person "I'm long/short" is NOT required. Read intent in context, not just verbatim verbs: "the easy one to avoid is treasuries", "you want to own equities over bonds here", "I'd stay away from the SaaS names", "where I'd put money is energy" are all selections naming that exposure. An eliciting prompt or a clear repositioning frame IS required, though — generic market-timing advice with no named pick ("buy the dip when the media panics") stays a view, as do consumer/product enthusiasm and conduct/competitive analysis.
  - "pair_trade" — a leg of a paired long/short: "long X / short Y", "own X over Y".
  - "basket" — a named basket/sector/theme pick rather than a single company: "Mag 7", "software industrial complex", "enterprise SaaS", "capital equipment", "memory stocks", "prediction-market/gambling space". Use this when the speaker's own pick/trade language is explicitly about the group. If the group is not a single tradable equity, still emit it with ticker=null; structural tradability is handled later.
  A non-"view" callType needs the SPEAKER's own position OR their named own/buy/avoid answer to a positioning/predictions prompt — judge intent in context, do not demand a literal "I'm long/short". Still lean to "view" when there is no position and no positioning prompt; never infer a call from mere enthusiasm, analysis, or generic advice.
- excludeReason: leave null normally. Set it ONLY when the take is genuinely call-shaped (you gave it a non-"view" callType) but should be recorded WITHOUT scoring: "conditional" (the action waits on an unresolved event — "I'd buy if the deal breaks"), "day_trade_aside" (an explicitly tactical/day-trade remark), or "not_investment_call" (the pick isn't really an equity bet). Keep the callType that describes the shape and put the gating detail in scoreNote.
- scoreNote: optional one-line audit note — the evidence that made it a call ("ranked #1 AI pick", "short leg of spread") or the condition that gates it. Omit for plain views. If you name the speaker in the note, it MUST be THIS take's host — never attribute the call to a different person (when in doubt, describe the call without naming anyone).
  Note: an advantage scoped to ONE product category of a diversified company ("outstanding position to do the agent thing") is not, by itself, a company-level bull claim — without a stated company-level consequence, keep stance neutral or mark the hedge with low conviction.
- ticker: the correct US-listed symbol ONLY if you are confident and the company is publicly traded. For private companies (e.g. SpaceX, OpenAI, Anthropic, Stripe) set ticker=null and isPublic=false.
- sectorProxy: ONLY for a basket/sector/theme/macro call (not a single company) that has no direct ticker but IS fairly represented by one of these liquid ETFs — set it to that ticker so the call can be priced; otherwise null. Leave the company's own ticker null; this proxy is attached and disclosed downstream. Choose at most one, and only when the pick genuinely IS that exposure (a bearish "short the Mag 7" is still MAGS — direction comes from stance, not the proxy). Available proxies:
${SECTOR_PROXY_PROMPT}
- quote: a SHORT verbatim excerpt (≤ 240 characters) from that host that best supports the thesis. Copy it exactly from the transcript. Set quoteStartSec to the integer second shown in that line's "[<sec>s <Speaker>]" prefix.
  THE QUOTE MUST CARRY THE EVIDENCE FOR YOUR LABELS. For any non-"view" callType, the quote must contain the in/out or selection words ("I'm in", "I would be long it", "I just bought", "my pick", "number 1", "best place to invest", "long X / short Y", or — for a positioning-prompt answer — the own/buy/avoid naming itself: "the one to avoid is X", "you want to own X over Y"). If stance is bull/bear, the quote must contain the economic claim. Prefer the sentence that PROVES the classification over the most colorful one — a take whose quote doesn't evidence its labels will be treated as misclassified.
- summary: one clear sentence capturing the host's view and reasoning.
- topics: 1–4 short tags (e.g. "AI capex", "valuation", "regulation").
- Be conservative: if there is no substantive company-specific view, return an empty list. Do not invent quotes.
- Do NOT extract passing mentions: a company merely named while reading a news item or listed alongside others is not a thesis. If a single sentence rattles off several companies, that is a mention, not a per-company thesis — skip it unless a host gives that specific company its own directional take.
- Do NOT treat a category that is merely "interesting" or an explanatory aside as a selection. "There's a category we didn't talk about..." is a view unless the host says it is their pick/trade or explicitly long/short.
- Shared quotes are allowed ONLY for one explicit list/basket call where the host names multiple selected legs in the same quoted sentence ("we have 25% of our portfolio in SK Hynix, Samsung, Micron", "long X and short Y", "my pick is Robinhood/Polymarket/PrizePicks"). In that case every emitted leg must be call-shaped (selection, basket, pair_trade, explicit_long/short), the quote must contain that leg's name, and scoreNote must explain the shared basket/list call. For ordinary views, news lists, and passive sector examples, never reuse one quote across multiple companies.

Final self-check, for every thesis before you emit it: is this a forward-looking view on the company as an investment? If it is merely a reaction to a news item, emit nothing for that company.`;

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    theses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          ticker: { type: ["string", "null"] },
          isPublic: { type: "boolean" },
          host: { type: "string", enum: [...HOST_VALUES] },
          stance: { type: "string", enum: ["bull", "bear", "neutral", "mixed"] },
          conviction: { type: "string", enum: ["low", "medium", "high"] },
          callType: { type: "string", enum: [...CALL_TYPE_VALUES], description: "view = commentary (not scored); the rest are scoreable call shapes" },
          excludeReason: { type: ["string", "null"], enum: [...EXCLUDE_REASON_VALUES, null] },
          scoreNote: { type: ["string", "null"] },
          sectorProxy: { type: ["string", "null"], enum: [...SECTOR_PROXY_TICKER_VALUES, null], description: "Representative ETF ticker for a sector/theme/macro basket with no direct ticker; null otherwise" },
          summary: { type: "string" },
          quote: { type: "string", description: "Verbatim excerpt ≤240 chars" },
          quoteStartSec: { type: ["number", "null"] },
          topics: { type: "array", items: { type: "string" } },
        },
        required: [
          "company",
          "ticker",
          "isPublic",
          "host",
          "stance",
          "conviction",
          "callType",
          "summary",
          "quote",
          "quoteStartSec",
          "topics",
        ],
      },
    },
  },
  required: ["theses"],
};

const MAX_CHARS = 160_000;

function formatTranscript(t: Transcript): { text: string; truncated: boolean } {
  const lines = t.utterances.map(
    (u) => `[${Math.round(u.startMs / 1000)}s ${u.speaker}] ${u.text}`,
  );
  let text = lines.join("\n");
  let truncated = false;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    truncated = true;
  }
  return { text, truncated };
}

function slug(company: string, ticker: string | null): string {
  if (ticker) return ticker.toLowerCase();
  return company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The raw extraction call — one LLM pass over the transcript, mapped to Thesis
 * rows, BEFORE the adversarial verify pass. Exposed so callers (and evals) can
 * run extraction and verification as separate, swappable stages.
 */
export async function extractRawTheses(
  ep: Episode,
  t: Transcript,
): Promise<Thesis[]> {
  const { text, truncated } = formatTranscript(t);
  if (truncated) {
    console.log(`  (transcript truncated to ${MAX_CHARS} chars for extraction)`);
  }

  const result = await callTool({
    system: SYSTEM,
    user: `Episode ${ep.id} — "${ep.title}" (${ep.date.slice(0, 10)}).\n\nTranscript:\n\n${text}`,
    toolName: "submit_theses",
    toolDescription: "Submit the extracted company theses for this episode.",
    inputSchema: INPUT_SCHEMA,
    validate: ExtractionSchema,
    maxTokens: 8192,
  });

  return result.theses.map((item, i) => ({
    id: `${ep.id}-${slug(item.company, item.ticker)}-${item.host}-${i}`,
    episodeId: ep.id,
    episodeNumber: ep.number,
    episodeDate: ep.date,
    company: item.company,
    ticker: item.ticker ? item.ticker.toUpperCase() : null,
    isPublic: item.isPublic,
    host: item.host as Host,
    stance: item.stance,
    conviction: item.conviction,
    callType: item.callType,
    excludeReason: item.excludeReason ?? null,
    scoreNote: item.scoreNote ?? null,
    sectorProxy: item.sectorProxy ?? null,
    summary: item.summary,
    quote: trimPublishedQuote(item.quote),
    quoteStartMs: item.quoteStartSec != null ? item.quoteStartSec * 1000 : null,
    topics: item.topics,
  }));
}

/** Extract per-host company theses from a named transcript, then verify them. */
export async function extractTheses(
  ep: Episode,
  t: Transcript,
): Promise<Thesis[]> {
  const theses = await extractRawTheses(ep, t);

  // Adversarial pass: drop passing mentions/enumerations, repair quotes that
  // don't yet carry their claim, neutralize genuinely inferred stances, and
  // judge scoreability (callType) against the full transcript. This is the
  // single place those judgments are made — no regex post-filter.
  const verified = await verifyTheses(ep, theses, t);

  const byCompany = new Map<string, number>();
  for (const th of verified) byCompany.set(th.company, (byCompany.get(th.company) ?? 0) + 1);
  const summary = [...byCompany.entries()]
    .map(([c, n]) => `${c}(${n})`)
    .join(", ");
  console.log(`  ✓ extracted ${verified.length} theses across ${byCompany.size} companies: ${summary}`);

  return verified;
}
