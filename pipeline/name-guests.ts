import fs from "node:fs";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { HOLDINGS_FILE } from "./config";
import type { IndexSnapshot, Thesis, Transcript } from "../lib/types";

const SYSTEM = `You identify the named GUEST(s) on an All-In podcast episode from evidence.

The four hosts are NEVER guests: Chamath Palihapitiya, Jason Calacanis, David Sacks
(Sacky), David Friedberg (Freeberg). Anyone else speaking is a guest.

How to identify a guest cluster, in priority order:
1. HOST INTRODUCTIONS are authoritative. A host welcomes the guest by name —
   "our guy Gavin Baker is here", "the one and only Bill Gurley", "joining us …
   Mr. Mark Pincus", "back on the program, X". Use that name.
2. SELF-INTRODUCTION — "I'm <name>", "this is <name>".
3. The name the transcript-derived summaries attribute the cluster's takes to
   (provided as a hint) — this reflects the full episode context.

CRITICAL RULES:
- The episode TITLE names topics and public figures who are usually NOT the guest.
  An episode titled "…Newsom's Price Caps" does NOT mean Gavin Newsom is the guest.
  Never infer the guest from the title alone.
- Several frequent guests share a first name (Gavin Baker vs Gavin Newsom; Marc
  Andreessen vs Mark Pincus). If you only have a first name, rely on the host
  introduction and what the person actually discusses — do not guess the more
  famous one.
- Return the guest's FULL name ("Gavin Baker", not "Gavin" or "Baker").
- If a cluster's identity is not clearly supported by evidence, return null.
  A confident null is far better than a wrong name.`;

const Schema = z.object({
  clusters: z.array(
    z.object({
      cluster: z.string(),
      name: z.string().nullable(),
    }),
  ),
});

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    clusters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cluster: { type: "string" },
          name: { type: ["string", "null"], description: "Full name or null if unclear" },
        },
        required: ["cluster", "name"],
      },
    },
  },
  required: ["clusters"],
};

/** Frequent-guest roster: maps partial mentions (surname / first name) → full name. */
const GUEST_ALIASES: Record<string, string> = {
  gerstner: "Brad Gerstner",
  baker: "Gavin Baker",
  gurley: "Bill Gurley",
  benioff: "Marc Benioff",
  pincus: "Mark Pincus",
  andreessen: "Marc Andreessen",
  levie: "Aaron Levie",
  rabois: "Keith Rabois",
  lonsdale: "Joe Lonsdale",
  gracias: "Antonio Gracias",
  kalanick: "Travis Kalanick",
  hoffman: "Reid Hoffman",
  summers: "Larry Summers",
  khanna: "Ro Khanna",
  ferriss: "Tim Ferriss",
  boreing: "Jeremy Boreing",
};

/** Full-name spelling/casing fixes so one person isn't split across variants.
 *  Keyed by the lowercased full name as the model/transcript renders it. */
const NAME_CANON: Record<string, string> = {
  "thomas lafont": "Thomas Laffont",
  "thomas lafonte": "Thomas Laffont",
  "thomas laffont": "Thomas Laffont",
  "philippe lafont": "Philippe Laffont",
  "philippe laffont": "Philippe Laffont",
  "sian bowers-franklin": "Cyan Bowers-Franklin",
  "cyan bowers-franklin": "Cyan Bowers-Franklin",
};

/** Resolve a possibly-partial name to a canonical full name using the per-episode
 *  full names seen in evidence, then the global alias roster. Returns null if it
 *  can only be resolved to a bare first name. */
function canonicalName(raw: string | null, episodeFullNames: Set<string>): string | null {
  if (!raw) return null;
  const name = raw.trim().replace(/[.,]$/, "");
  if (!name) return null;
  if (NAME_CANON[name.toLowerCase()]) return NAME_CANON[name.toLowerCase()];
  const tokens = name.split(/\s+/);
  // Already a full name (>= 2 tokens, both capitalized words).
  if (tokens.length >= 2 && /^[A-Z]/.test(tokens[0]) && /^[A-Z]/.test(tokens[1])) {
    // Normalize known recurring guests by surname so transcription slips of the
    // first name ("Brian Gerstner" → "Brad Gerstner") collapse to one person.
    const surname = tokens[tokens.length - 1].toLowerCase();
    if (GUEST_ALIASES[surname]) return GUEST_ALIASES[surname];
    return name;
  }
  const lower = name.toLowerCase();
  // Surname-only → alias roster, but only if it matches a full name in this episode
  // (prevents cross-episode bleed) or is unambiguous in the roster.
  if (GUEST_ALIASES[lower]) {
    const full = GUEST_ALIASES[lower];
    if (episodeFullNames.has(full) || episodeFullNames.size === 0) return full;
    return full; // roster entries are unambiguous public figures
  }
  // First-name-only: try to match a full name present in the episode evidence.
  const match = [...episodeFullNames].find((f) => f.toLowerCase().split(/\s+/)[0] === lower);
  if (match) return match;
  return null; // a bare first name we can't resolve — better to leave anonymous
}

/** Extract the speaker the summary attributes its take to (its leading name). */
function summaryLead(summary: string): string | null {
  if (!summary) return null;
  let m = summary.match(/^(?:The\s+)?guest\s*\(([^)]+)\)/i);
  if (m) return m[1].trim();
  m = summary.match(
    /^([A-Z][a-zA-Z.\-]+(?:\s+[A-Z][a-zA-Z.\-]+){0,2})\s+(?:argues|believes|highlights|cites|describes|warns|says|notes|is\b|expresses|praises|views|frames|claims|thinks|predicts|defends|dismisses|recommends|points|explains|contends|maintains)/,
  );
  if (m && !/^(The|This|Guest|He|She|They)$/.test(m[1])) return m[1].trim();
  return null;
}

const INTRO_RE =
  /\b(is here|is back|welcome back|joining us|our friend|our guy|our pal|our buddy|back on the program|the one(?:,| and)? the only|with us (?:again )?today|with us is|also with us|comes to us|here from|great to have|thanks for (?:coming|joining)|introduce|sitting in for|Mr\.|Ms\.|Dr\.)\b/i;

/** Host utterances that look like they introduce/welcome a guest (whole transcript). */
function introLines(tr: Transcript): string[] {
  const out: string[] = [];
  for (const u of tr.utterances) {
    if (u.speaker === "Guest" || u.speaker === "Unknown") continue;
    if (INTRO_RE.test(u.text)) out.push(`[${u.speaker}] ${u.text.slice(0, 240)}`);
    if (out.length >= 12) break;
  }
  return out;
}

function guestClusters(tr: Transcript): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const u of tr.utterances) {
    if (u.speaker !== "Guest") continue;
    const arr = map.get(u.cluster) ?? [];
    if (arr.length < 6 && u.text.length > 80) arr.push(u.text.slice(0, 300));
    map.set(u.cluster, arr);
  }
  return map;
}

/** Cluster of the utterance containing (or nearest after) a timestamp. */
function clusterAt(tr: Transcript, ms: number | null): string | null {
  if (ms == null) return null;
  for (const u of tr.utterances) {
    if (ms >= u.startMs && ms < u.endMs) return u.speaker === "Guest" ? u.cluster : null;
  }
  return null;
}

/** Identify guests per episode and stamp guestName onto their takes. */
export async function nameGuests(): Promise<void> {
  const byId = new Map<string, string>();
  let named = 0;
  let unnamed = 0;
  const overrides: string[] = [];

  for (const epId of store.listEpisodeIds()) {
    const theses = store.loadTheses(epId);
    const guestTakes = theses.filter((t) => t.host === "Guest");
    if (!guestTakes.length) continue;
    const tr = store.loadTranscript(epId);
    const ep = store.loadEpisode(epId);
    if (!tr || !ep) continue;

    const clusters = guestClusters(tr);
    if (!clusters.size) continue;

    // Wide intro (catches introductions that arrive after the cold-open banter).
    const intro = tr.utterances
      .slice(0, 45)
      .map((u) => `[${u.speaker}] ${u.text.slice(0, 200)}`)
      .join("\n");
    const intros = introLines(tr);
    const samples = [...clusters.entries()]
      .map(([c, texts]) => `cluster ${c}:\n${texts.map((t) => `  "${t}"`).join("\n")}`)
      .join("\n\n");

    // Summary-attributed lead name per cluster (strong context hint).
    const leadByCluster = new Map<string, string[]>();
    const episodeFullNames = new Set<string>();
    for (const t of guestTakes) {
      const lead = summaryLead(t.summary);
      if (!lead) continue;
      const c = clusterAt(tr, t.quoteStartMs);
      const key = c ?? "?";
      const arr = leadByCluster.get(key) ?? [];
      arr.push(lead);
      leadByCluster.set(key, arr);
      const toks = lead.split(/\s+/);
      if (toks.length >= 2 && /^[A-Z]/.test(toks[0]) && /^[A-Z]/.test(toks[1])) episodeFullNames.add(lead);
    }
    // Pull full names out of intro lines too (Mr. Mark Pincus, Gavin Baker, …).
    for (const line of intros)
      for (const m of line.matchAll(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g)) episodeFullNames.add(m[1]);
    const leadHint = [...leadByCluster.entries()]
      .map(([c, names]) => `cluster ${c}: summaries attribute takes to "${[...new Set(names)].join(", ")}"`)
      .join("\n");

    const result = await callTool({
      system: SYSTEM,
      user:
        `Episode title: "${ep.title}"\n\n` +
        `Opening:\n${intro}\n\n` +
        (intros.length ? `Host introduction lines (authoritative):\n${intros.join("\n")}\n\n` : "") +
        `Guest clusters:\n\n${samples}\n\n` +
        (leadHint ? `Summary attribution hints:\n${leadHint}` : ""),
      toolName: "submit_names",
      toolDescription: "Submit the identified full name (or null) for each guest cluster.",
      inputSchema: INPUT_SCHEMA,
      validate: Schema,
      maxTokens: 1024,
    });

    const nameOf = new Map(
      result.clusters.map((c) => [c.cluster, canonicalName(c.name, episodeFullNames)]),
    );
    const single = clusters.size === 1 ? (nameOf.get([...clusters.keys()][0]) ?? null) : null;

    let changed = false;
    for (const t of guestTakes) {
      const cluster = clusterAt(tr, t.quoteStartMs);
      let name = (cluster ? nameOf.get(cluster) : null) ?? single;

      // Deterministic safety net: if the take's own summary attributes it to a
      // DIFFERENT person than the model picked, trust the summary — it was
      // written with full per-utterance context. (Same person in a shorter form,
      // e.g. "RFK Jr" vs "Robert F. Kennedy Jr", keeps the fuller name.)
      // Only a confident full name (≥2 meaningful tokens) may override the model;
      // this lets the well-grounded summary attribution win (including for
      // same-surname siblings like the Collisons) while an initialism such as
      // "RFK Jr" can never displace "Robert F. Kennedy Jr".
      const lead = canonicalName(summaryLead(t.summary), episodeFullNames);
      const leadIsFull = !!lead && lead.split(/\s+/).filter((x) => x.length > 2).length >= 2;
      if (lead && name && lead !== name && leadIsFull) {
        overrides.push(`  ${epId} ${t.id}: "${name}" → "${lead}" (summary lead)`);
        name = lead;
      } else if (lead && !name) {
        name = lead;
      }

      if (name) {
        t.guestName = name;
        byId.set(t.id, name);
        named++;
        changed = true;
      } else {
        delete t.guestName;
        unnamed++;
        changed = true;
      }
    }
    if (changed) store.saveTheses(epId, theses);
    const finalNames = [...new Set(guestTakes.map((t) => t.guestName).filter(Boolean))];
    console.log(`  ${epId}: ${finalNames.join(", ") || "(unidentified)"}`);
  }

  if (overrides.length) {
    console.log(`\nSummary-lead overrides (${overrides.length}):`);
    for (const o of overrides) console.log(o);
  }

  if (fs.existsSync(HOLDINGS_FILE)) {
    const snapshot: IndexSnapshot = JSON.parse(fs.readFileSync(HOLDINGS_FILE, "utf8"));
    for (const h of snapshot.holdings)
      for (const t of h.theses) {
        const n = byId.get(t.id);
        if (n) t.guestName = n;
        else if (t.host === "Guest") delete (t as Partial<Thesis>).guestName;
      }
    fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  }
  console.log(`\n✓ named ${named} guest takes; ${unnamed} remain anonymous.`);
}
