import { z } from "zod";
import { callTool } from "./llm";
import { trimPublishedQuote } from "../lib/quotes";
import { REGULAR_HOSTS } from "../lib/types";
import type { Episode, Thesis, Transcript, Host } from "../lib/types";

const HOST_VALUES = [...REGULAR_HOSTS, "Guest", "Unknown"] as const;

const ThesisItemSchema = z.object({
  company: z.string(),
  ticker: z.string().nullable(),
  isPublic: z.boolean(),
  host: z.enum(HOST_VALUES),
  stance: z.enum(["bull", "bear", "neutral", "mixed"]),
  conviction: z.enum(["low", "medium", "high"]),
  positional: z.boolean(),
  summary: z.string(),
  quote: z.string(),
  quoteStartSec: z.number().nullable(),
  topics: z.array(z.string()),
});

const ExtractionSchema = z.object({
  theses: z.array(ThesisItemSchema),
});

const SYSTEM = `You extract INVESTMENT theses about specific companies from All-In podcast transcripts.

A "thesis" is a host expressing a view about a company's value AS AN INVESTMENT — would you want to own the stock? Is it over- or under-valued? Are its business/competitive/financial prospects improving or deteriorating in a way that affects equity value?

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
- PRODUCT PRAISE, SHOUT-OUTS, AND PERKS are not theses. Loving a product, thanking a company for a gift or perk, plugging a sponsor, or sharing a consumer experience says nothing about the stock.
  Do NOT emit: "Chamath thanked Robinhood for sending him their gold card" — gratitude for swag, not an investment view. Do not launder it into "implicitly endorsing" anything.
  DO emit (bull): "Jason argues Robinhood's product velocity is winning the consumer brokerage market" — product observation deployed in service of a competitive claim about the business.

Rules:
- Extract one thesis per (host, company) per episode. Merge a host's scattered remarks about the same company into a single, faithful thesis.
- Attribute each thesis to the host who actually holds the view, using the speaker labels in the transcript. If two hosts express distinct views on the same company, produce one thesis each.
- stance: "bull" (positive/long), "bear" (negative/short/skeptical), "neutral" (balanced/uncertain), or "mixed" (explicitly both sides).
  STANCE IS ECONOMIC DIRECTION, NOT APPROVAL — and the direction must be EXPLICITLY CLAIMED, never inferred. bull = the speaker claims the company's economic position or value is improving; bear = the speaker ties a concrete risk to the company's economics.
  All of these are NEUTRAL, not directional:
  - moral or policy disapproval of conduct ("they're pursuing regulatory capture to lock in monopolistic control") — even though a monopoly would be economically good for them;
  - describing a strategy as effective ("once rivals are gone they can raise the price of the bundle") — conduct commentary, unless the speaker says the business itself is strengthening;
  - morally-framed risk with no explicit economic tie ("they're circumventing export controls and 47% of revenue is China") — criticism of conduct, not a claimed revenue risk;
  - approving a policy or deal as good for outsiders ("the government taking equity is a better deal for taxpayers") — not a claim about the company's prospects.
  DO record as bear: "Apple's mandatory 30% fee is the prime candidate for antitrust intervention" — the speaker explicitly ties a legal threat to a named revenue stream.
  If the economic direction is not explicitly claimed, use "neutral".
- conviction: how strongly the host commits (hedged aside = low; emphatic, repeated, "this is the trade" = high).
- positional: true ONLY if the take clearly communicates an in/out ownership stance — "I'd own it here", "I bought more", "this is the trade", "I'd take profits", "wouldn't touch it", "this is a short". Criticism of a company someone might still hold is NOT an exit; praise without ownership intent is NOT a buy. Lean false when unsure.
  Do NOT mark positional: "Google is in an outstanding position to do [X] because they already have access to your calendar, documents, email" — being well-positioned is an observation about the company, not a statement of the speaker's ownership. Positional requires the SPEAKER's own in/out, in their words.
  The line: TRANSACTION or SELECTION language is positional — "I'm in", "I have shares", "I just bought", "my pick is", "I would be long X", "this is the trade", "probably a buying opportunity", "the short here is X". SENTIMENT language is NOT — "I'm bullish", "I wouldn't sleep on this company", "exceptional business", "those companies are toast", "you could buy X too, I guess".
  Note: an advantage scoped to ONE product category of a diversified company ("outstanding position to do the agent thing") is not, by itself, a company-level bull claim — without a stated company-level consequence, keep stance neutral or mark the hedge with low conviction.
- ticker: the correct US-listed symbol ONLY if you are confident and the company is publicly traded. For private companies (e.g. SpaceX, OpenAI, Anthropic, Stripe) set ticker=null and isPublic=false.
- quote: a SHORT verbatim excerpt (≤ 240 characters) from that host that best supports the thesis. Copy it exactly from the transcript. Set quoteStartSec to the integer second shown in that line's "[<sec>s <Speaker>]" prefix.
  THE QUOTE MUST CARRY THE EVIDENCE FOR YOUR LABELS. If positional=true, the quote must contain the in/out words ("I'm in", "I would be long it", "I just bought"). If stance is bull/bear, the quote must contain the economic claim. Prefer the sentence that PROVES the classification over the most colorful one — a take whose quote doesn't evidence its labels will be treated as misclassified.
- summary: one clear sentence capturing the host's view and reasoning.
- topics: 1–4 short tags (e.g. "AI capex", "valuation", "regulation").
- Be conservative: if there is no substantive company-specific view, return an empty list. Do not invent quotes.
- Do NOT extract passing mentions: a company merely named while reading a news item or listed alongside others is not a thesis. If a single sentence rattles off several companies, that is a mention, not a per-company thesis — skip it unless a host gives that specific company its own directional take.
- Each thesis must have its OWN distinct supporting quote. Never reuse one quote across multiple companies.

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
          positional: { type: "boolean", description: "Clear in/out ownership signal, not commentary" },
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
          "positional",
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

/** Extract per-host company theses from a named transcript. */
export async function extractTheses(
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

  const theses: Thesis[] = result.theses.map((item, i) => ({
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
    positional: item.positional,
    summary: item.summary,
    quote: trimPublishedQuote(item.quote),
    quoteStartMs: item.quoteStartSec != null ? item.quoteStartSec * 1000 : null,
    topics: item.topics,
  }));

  const byCompany = new Map<string, number>();
  for (const th of theses) byCompany.set(th.company, (byCompany.get(th.company) ?? 0) + 1);
  const summary = [...byCompany.entries()]
    .map(([c, n]) => `${c}(${n})`)
    .join(", ");
  console.log(`  ✓ extracted ${theses.length} theses across ${byCompany.size} companies: ${summary}`);

  return theses;
}
