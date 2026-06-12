import fs from "node:fs";
import { z } from "zod";
import { callTool } from "./llm";
import { store } from "./store";
import { HOLDINGS_FILE } from "./config";
import type { IndexSnapshot, Transcript } from "../lib/types";

const SYSTEM = `You identify the named GUEST(s) in a podcast episode from evidence.

You get the episode title, the opening of the transcript, and samples from each
unidentified ("Guest") speaker cluster. Return each cluster's full real name —
ONLY when the evidence clearly supports it: the title names them, a host
introduces them, or they introduce themselves. The All-In hosts (Chamath
Palihapitiya, Jason Calacanis, David Sacks, David Friedberg) are never guests.
If a cluster's identity is not clearly determinable, return null for it.`;

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

  for (const epId of store.listEpisodeIds()) {
    const theses = store.loadTheses(epId);
    const guestTakes = theses.filter((t) => t.host === "Guest");
    if (!guestTakes.length) continue;
    const tr = store.loadTranscript(epId);
    const ep = store.loadEpisode(epId);
    if (!tr || !ep) continue;

    const clusters = guestClusters(tr);
    if (!clusters.size) continue;
    const intro = tr.utterances
      .slice(0, 14)
      .map((u) => `[${u.speaker}] ${u.text.slice(0, 200)}`)
      .join("\n");
    const samples = [...clusters.entries()]
      .map(([c, texts]) => `cluster ${c}:\n${texts.map((t) => `  "${t}"`).join("\n")}`)
      .join("\n\n");

    const result = await callTool({
      system: SYSTEM,
      user: `Episode title: "${ep.title}"\n\nOpening:\n${intro}\n\nGuest clusters:\n\n${samples}`,
      toolName: "submit_names",
      toolDescription: "Submit the identified name (or null) for each guest cluster.",
      inputSchema: INPUT_SCHEMA,
      validate: Schema,
      maxTokens: 1024,
    });

    const nameOf = new Map(result.clusters.map((c) => [c.cluster, c.name]));
    const single = clusters.size === 1 ? (nameOf.get([...clusters.keys()][0]) ?? null) : null;

    let changed = false;
    for (const t of guestTakes) {
      const cluster = clusterAt(tr, t.quoteStartMs);
      const name = (cluster ? nameOf.get(cluster) : null) ?? single;
      if (name) {
        t.guestName = name;
        byId.set(t.id, name);
        named++;
        changed = true;
      } else unnamed++;
    }
    if (changed) store.saveTheses(epId, theses);
    console.log(`  ${epId}: ${[...new Set([...nameOf.values()].filter(Boolean))].join(", ") || "(unidentified)"}`);
  }

  if (fs.existsSync(HOLDINGS_FILE)) {
    const snapshot: IndexSnapshot = JSON.parse(fs.readFileSync(HOLDINGS_FILE, "utf8"));
    for (const h of snapshot.holdings)
      for (const t of h.theses) {
        const n = byId.get(t.id);
        if (n) t.guestName = n;
      }
    fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  }
  console.log(`\n✓ named ${named} guest takes; ${unnamed} remain anonymous.`);
}
