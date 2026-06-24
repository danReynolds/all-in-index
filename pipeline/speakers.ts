import { z } from "zod";
import { callTool } from "./llm";
import { HOST_PROFILES, REGULAR_HOSTS } from "../lib/types";
import type { Episode, Host, Transcript } from "../lib/types";

const HOST_VALUES = [...REGULAR_HOSTS, "Guest", "Unknown"] as const;

const SpeakerMapSchema = z.object({
  mapping: z.array(
    z.object({
      cluster: z.string(),
      speaker: z.enum(HOST_VALUES),
      confidence: z.enum(["low", "medium", "high"]),
      evidence: z.string(),
    }),
  ),
  notes: z.string(),
});

const SYSTEM = `You identify which speaker cluster belongs to which host on the All-In podcast.

The four regular hosts are:
${Object.values(HOST_PROFILES)
  .map((h) => `- ${h.fullName} (refer to as "${h.aliases[0]}"): ${h.blurb}`)
  .join("\n")}

The transcript was diarized into anonymous clusters labelled with capital letters (A, B, C, …). Each line is prefixed with its cluster. Your job: map every cluster to exactly one of: Chamath, Jason, Sacks, Friedberg, or Guest.

Strong cues to use:
- The episode TITLE: guests are often named in it ("… with Gavin Baker"), and interview episodes lead with the guest's name. If the title names a guest, expect a Guest cluster. But a plain roundtable title does NOT guarantee there's no guest — a guest can call in, drop in, or be played as a clip without being named in the title or metadata, so never force a clearly-non-host cluster onto a host just because none was announced.
- The intro. Jason almost always hosts the open ("welcome to episode N…") and introduces the others by name in a set order. Hosts often announce absences ("Sacks is out today") — believe them.
- Direct address: "Sacks, what do you think?", "Freeberg…", "Chamath…", "J-Cal".
- THIRD-PERSON reference is decisive the other way: a cluster that refers to one of the four hosts in the third person ("Chamath teed this up perfectly", "as Sacks was saying", "I agree with Friedberg") is NOT that host — map it to another host or to Guest. Self-identification is first-person only.
- FIRST-PERSON for a non-host firm/fund marks a Guest: a cluster speaking as the principal of an outside company or fund ("Altimeter has owned all of compute for three years… we still believe…", "here at Newsmax", "what we're seeing at our firm") is a Guest, not the topically-nearest host — content about one's OWN outside firm outweighs stylistic resemblance to a host.
- Self-reference and known speech patterns / topics (Friedberg = science/biotech/climate; Sacks = policy/SaaS/geopolitics; Chamath = markets/macro/"my number is"; Jason = moderation, startups, ad reads) — use as a tie-breaker only, never to override the first/third-person signals above.
- A non-host interviewee should be mapped to "Guest". Two clusters may map to the same host if diarization over-split them.

Be honest about confidence: "high" only when direct address or self-identification pins the cluster; "medium" for strong stylistic/topical evidence; "low" when you are guessing. Only use "Unknown" if there is genuinely no signal. Cite the concrete evidence (a quote or cue) for each mapping.`;

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    mapping: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cluster: { type: "string", description: "Cluster letter, e.g. 'A'" },
          speaker: { type: "string", enum: [...HOST_VALUES] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidence: { type: "string", description: "Concrete cue/quote justifying the mapping" },
        },
        required: ["cluster", "speaker", "confidence", "evidence"],
      },
    },
    notes: { type: "string", description: "Any caveats about the mapping" },
  },
  required: ["mapping", "notes"],
};

/** Build a token-bounded digest: the opening, plus an even sample across the rest. */
function buildDigest(t: Transcript, openingCount = 60, sampleCount = 60): string {
  const u = t.utterances;
  const opening = u.slice(0, openingCount);
  const rest = u.slice(openingCount);
  const step = rest.length > sampleCount ? Math.ceil(rest.length / sampleCount) : 1;
  const sampled = rest.filter((_, i) => i % step === 0);
  const fmt = (x: typeof u) =>
    x
      .map((s) => `[${s.cluster}] ${s.text.slice(0, 280)}`)
      .join("\n");
  return (
    `=== OPENING ===\n${fmt(opening)}\n\n=== SAMPLED ACROSS EPISODE ===\n${fmt(sampled)}`
  );
}

/**
 * Resolve diarization clusters to host names and apply the mapping to the
 * transcript in place (mutates and returns it). When episode metadata is
 * provided, the title primes the model on expected guests/absences.
 */
export async function nameSpeakers(t: Transcript, ep?: Episode | null): Promise<Transcript> {
  const clusters = [...new Set(t.utterances.map((u) => u.cluster))];
  const digest = buildDigest(t);

  const epContext = ep
    ? `Episode title: "${ep.title}" (${ep.date.slice(0, 10)}${ep.number ? `, E${ep.number}` : ""}).\n\n`
    : "";
  const user = `${epContext}Distinct clusters in this episode: ${clusters.join(", ")}

Map every one of these clusters. Transcript excerpt:

${digest}`;

  const result = await callTool({
    system: SYSTEM,
    user,
    toolName: "submit_speaker_map",
    toolDescription: "Submit the cluster→host mapping for this episode.",
    inputSchema: INPUT_SCHEMA,
    validate: SpeakerMapSchema,
    maxTokens: 2048,
  });

  const map: Record<string, Host> = {};
  const conf: Record<string, "low" | "medium" | "high"> = {};
  for (const m of result.mapping) {
    map[m.cluster] = m.speaker;
    conf[m.cluster] = m.confidence;
  }
  // Any cluster the model omitted falls back to Unknown / low confidence.
  for (const c of clusters) {
    if (!(c in map)) {
      map[c] = "Unknown";
      conf[c] = "low";
    }
  }

  t.speakerMap = map;
  t.speakerConfidence = conf;
  t.speakerMapNotes = result.notes;
  for (const u of t.utterances) u.speaker = map[u.cluster] ?? "Unknown";

  const summary = result.mapping
    .map((m) => `${m.cluster}→${m.speaker}(${m.confidence})`)
    .join("  ");
  console.log(`  ✓ speakers resolved: ${summary}`);

  return t;
}
