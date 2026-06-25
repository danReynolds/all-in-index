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
  /** Distinct humans the content shows — counted independently of the clusters,
   * so distinctSpeakers > clusterCount flags an under-segmented diarization. */
  distinctSpeakers: z.number(),
  /** Cluster letters that appear to fuse more than one distinct speaker. */
  mergedClusters: z.array(z.string()).optional(),
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

Be honest about confidence: "high" only when direct address or self-identification pins the cluster; "medium" for strong stylistic/topical evidence; "low" when you are guessing. Only use "Unknown" if there is genuinely no signal. Cite the concrete evidence (a quote or cue) for each mapping.

Also report two diagnostics that catch an UNDER-SEGMENTED diarization (clusters that fused two people into one):
- distinctSpeakers: how many distinct humans you can actually identify in the content. Count CONSERVATIVELY — only people you're confident spoke — but INCLUDE anyone who appears fused into a shared cluster with someone else. If one cluster clearly holds two people (it speaks AS a host yet also refers to that host in the third person, or mixes a host's voice with a guest naming their own firm in the first person), count them as two. So distinctSpeakers can exceed the number of clusters.
- mergedClusters: list the cluster letters that appear to contain more than one distinct speaker (empty if the diarization looks clean). distinctSpeakers > cluster count is the signal the audio needs re-transcribing at a finer speaker count.`;

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
    distinctSpeakers: { type: "number", description: "How many distinct human speakers the content actually shows (count conservatively; INCLUDE anyone fused into a shared cluster — so this can exceed the cluster count)." },
    mergedClusters: { type: "array", items: { type: "string" }, description: "Cluster letters that appear to contain more than one distinct speaker; empty if the diarization looks clean." },
  },
  required: ["mapping", "notes", "distinctSpeakers"],
};

/** Build a token-bounded digest: the opening, an even time-sample, AND each
 * cluster's most substantive lines. The per-cluster section is what makes a
 * cluster identifiable: an even time-sample can miss a speaker's defining lines
 * (self-ID, who-they-address, their own firm) if they talk in bursts — which is
 * exactly how a guest's cluster gets mislabeled as a host. */
function buildDigest(t: Transcript, openingCount = 60, sampleCount = 60, perClusterCount = 6): string {
  const u = t.utterances;
  const opening = u.slice(0, openingCount);
  const rest = u.slice(openingCount);
  const step = rest.length > sampleCount ? Math.ceil(rest.length / sampleCount) : 1;
  const sampled = rest.filter((_, i) => i % step === 0);
  const fmt = (x: typeof u) =>
    x
      .map((s) => `[${s.cluster}] ${s.text.slice(0, 280)}`)
      .join("\n");
  // The longest few lines per cluster — guarantees every cluster's character is
  // visible to the namer (longest lines carry the most identifying signal).
  const clusters = [...new Set(u.map((s) => s.cluster))];
  const perCluster = clusters.flatMap((c) =>
    u
      .filter((s) => s.cluster === c)
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, perClusterCount),
  );
  return (
    `=== OPENING ===\n${fmt(opening)}\n\n` +
    `=== SAMPLED ACROSS EPISODE ===\n${fmt(sampled)}\n\n` +
    `=== EACH CLUSTER'S MOST SUBSTANTIVE LINES (use these to identify who each cluster is) ===\n${fmt(perCluster)}`
  );
}

const HOST_ALIASES: Record<string, string[]> = {
  Chamath: ["chamath"],
  Jason: ["jason", "jcal", "j-cal", "calacanis"],
  Sacks: ["sacks"],
  Friedberg: ["friedberg", "freeberg"],
};

/**
 * Clusters that refer to their OWN mapped host by name in the third person.
 * A speaker doesn't name themselves, so such a cluster has fused that host with
 * whoever is talking about them — a diarization merge. This is a DETERMINISTIC
 * backstop to the model's self-reported merge count, which is unreliable (it
 * reported a clean 6/6 on E250 while cluster C demonstrably fused Chamath +
 * Gerstner). Self/show introductions ("I'm Jason", "welcome … Jason") are not
 * third-person references and don't count.
 */
export function selfReferencedClusters(
  map: Record<string, string>,
  utterances: Array<{ cluster: string; text: string }>,
): string[] {
  const flagged = new Set<string>();
  for (const u of utterances) {
    const aliases = HOST_ALIASES[map[u.cluster]];
    if (!aliases || flagged.has(u.cluster)) continue;
    outer: for (const n of aliases) {
      const re = new RegExp(`(.{0,24})\\b${n}\\b`, "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(u.text)) !== null) {
        // Skip a self-introduction: a name-intro keyword followed only by name
        // words up to this alias — "I'm Jason Calacanis", "I'm David Sacks",
        // "this is Chamath". A genuine third-person reference ("Chamath teed
        // this up") has the name standing on its own, so it still flags.
        if (/\b(i'?m|i am|this is|my name is)\s+(\w+\s+){0,2}$/i.test(m[1])) continue;
        flagged.add(u.cluster);
        break outer;
      }
    }
  }
  return [...flagged];
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

  // Deterministic merge guard (see selfReferencedClusters): the model's own
  // merge-count is unreliable (on E250 it reported a clean 6/6 while cluster C
  // demonstrably fused Chamath + Gerstner), so we also detect it in code.
  const merged = new Set([...(result.mergedClusters ?? []), ...selfReferencedClusters(map, t.utterances)]);
  const mergedArr = [...merged];
  t.mergedClusters = mergedArr;
  // A flagged cluster fuses ≥2 people, so the true speaker count is at least
  // clusterCount + (one extra per merged cluster) — this is what trips the
  // self-heal's `distinctSpeakers > clusterCount` check.
  t.distinctSpeakers = Math.max(result.distinctSpeakers, clusters.length + mergedArr.length);
  for (const u of t.utterances) u.speaker = map[u.cluster] ?? "Unknown";

  const summary = result.mapping
    .map((m) => `${m.cluster}→${m.speaker}(${m.confidence})`)
    .join("  ");
  const underSeg = result.distinctSpeakers > clusters.length;
  console.log(
    `  ✓ speakers resolved: ${summary}` +
      (underSeg
        ? `  ⚠ ${clusters.length} clusters but ~${result.distinctSpeakers} speakers${result.mergedClusters?.length ? ` (merged: ${result.mergedClusters.join(",")})` : ""}`
        : ""),
  );

  return t;
}
