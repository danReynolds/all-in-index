import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { callTool } from "./llm";
import type { Holding } from "../lib/types";

const CACHE_FILE = path.join(process.cwd(), "data", "companies.json");

interface CompanyMeta {
  description: string;
  domain: string | null;
}

function loadCache(): Record<string, CompanyMeta> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CompanyMeta>) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + "\n");
}

const MetaSchema = z.object({
  companies: z.array(
    z.object({
      slug: z.string(),
      description: z.string(),
      domain: z.string().nullable(),
    }),
  ),
});

const SYSTEM = `You provide one-line company profiles for an investing site.

For each company in the list, return:
- description: a neutral, factual ~12–18 word summary of what the company does. No hype, no stance.
- domain: the company's primary website domain, bare (e.g. "apple.com", "anthropic.com"). null if you are not confident.

Use the ticker as a disambiguation hint when present.`;

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    companies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: { type: "string" },
          description: { type: "string" },
          domain: { type: ["string", "null"] },
        },
        required: ["slug", "description", "domain"],
      },
    },
  },
  required: ["companies"],
};

/**
 * Ensure every holding has a description + domain. Cached in
 * data/companies.json keyed by slug, so this only spends tokens on companies
 * it hasn't seen before (one batched call per ~50 new names). Mutates the
 * holdings in place.
 */
export async function ensureCompanyMeta(holdings: Holding[]): Promise<void> {
  const cache = loadCache();
  const missing = holdings.filter((h) => !cache[h.slug]);

  if (missing.length > 0) {
    console.log(`Generating company profiles for ${missing.length} new names…`);
    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50);
      const list = chunk
        .map((h) => `- slug: ${h.slug} | name: ${h.company}${h.ticker ? ` | ticker: ${h.ticker}` : " | private company"}`)
        .join("\n");
      try {
        const result = await callTool({
          system: SYSTEM,
          user: `Companies:\n${list}`,
          toolName: "submit_company_profiles",
          toolDescription: "Submit the description + domain for each company.",
          inputSchema: INPUT_SCHEMA,
          validate: MetaSchema,
          maxTokens: 8192,
        });
        for (const c of result.companies) {
          cache[c.slug] = {
            description: c.description,
            domain: c.domain ? c.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null,
          };
        }
      } catch (e) {
        console.error(`  profile batch failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    saveCache(cache);
  }

  for (const h of holdings) {
    const meta = cache[h.slug];
    h.description = meta?.description ?? null;
    h.domain = meta?.domain ?? null;
  }
}
