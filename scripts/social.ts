import fs from "node:fs";
import path from "node:path";
import { getIndex } from "../lib/data";
import { formatSocialCheckResult, runSocialCheck } from "../lib/social/check";
import { generateSocialCandidates, type PredictionsFileLike } from "../lib/social/generate";
import {
  appendSocialLedgerEntry,
  candidateToLedgerEntry,
  readSocialLedger,
} from "../lib/social/ledger";
import { publishSocialCandidate } from "../lib/social/publish";
import { renderSocialDraftsMarkdown } from "../lib/social/render";
import { writeCandidateVisualAssets } from "../lib/social/visual";
import type { SocialCandidate, SocialDraftBundle, SocialKind } from "../lib/social/types";

interface GenerateArgs {
  jsonOut?: string;
  mdOut?: string;
  ledger?: string;
  siteUrl?: string;
  assetsDir?: string;
  kinds?: SocialKind[];
  scheduleIds?: string[];
  includeRecentlyUsed?: boolean;
}

function readFlag(rest: string[], name: string): string | undefined {
  const idx = rest.indexOf(name);
  return idx >= 0 ? rest[idx + 1] : undefined;
}

function readRepeated(rest: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === name && rest[i + 1]) values.push(rest[i + 1]);
  }
  return values;
}

function parseGenerateArgs(rest: string[]): GenerateArgs {
  const kinds = readRepeated(rest, "--kind").flatMap((v) => v.split(",").map((s) => s.trim()).filter(Boolean));
  const scheduleIds = readRepeated(rest, "--schedule-id").flatMap((v) => v.split(",").map((s) => s.trim()).filter(Boolean));
  return {
    jsonOut: readFlag(rest, "--json-out"),
    mdOut: readFlag(rest, "--md-out"),
    ledger: readFlag(rest, "--ledger"),
    siteUrl: readFlag(rest, "--site-url"),
    assetsDir: readFlag(rest, "--assets-dir"),
    kinds: kinds.length ? (kinds as SocialKind[]) : undefined,
    scheduleIds: scheduleIds.length ? scheduleIds : undefined,
    includeRecentlyUsed: rest.includes("--include-recent"),
  };
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function readBundle(file: string): SocialDraftBundle {
  return JSON.parse(fs.readFileSync(file, "utf8")) as SocialDraftBundle;
}

function selectCandidate(bundle: SocialDraftBundle, candidateId?: string): SocialCandidate {
  if (candidateId) {
    const candidate = bundle.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
    return candidate;
  }
  if (bundle.candidates.length !== 1) {
    throw new Error(`--candidate-id is required when bundle has ${bundle.candidates.length} candidates.`);
  }
  return bundle.candidates[0];
}

function loadPredictions(): PredictionsFileLike | null {
  const file = path.join(process.cwd(), "data", "predictions.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as PredictionsFileLike;
}

async function cmdGenerate(rest: string[]): Promise<void> {
  const args = parseGenerateArgs(rest);
  const { snapshot } = getIndex();
  const ledgerEntries = readSocialLedger(args.ledger);
  const bundle = generateSocialCandidates(snapshot, {
    siteUrl: args.siteUrl,
    kinds: args.kinds,
    scheduleIds: args.scheduleIds,
    ledgerEntries,
    includeRecentlyUsed: args.includeRecentlyUsed,
    predictions: loadPredictions(),
  });
  const markdown = renderSocialDraftsMarkdown(bundle);

  if (args.jsonOut) writeFile(args.jsonOut, `${JSON.stringify(bundle, null, 2)}\n`);
  if (args.mdOut) writeFile(args.mdOut, markdown);
  if (args.assetsDir) {
    const written = writeCandidateVisualAssets(bundle, args.assetsDir);
    if (!args.jsonOut && !args.mdOut) {
      for (const file of written) process.stderr.write(`wrote ${file}\n`);
    }
  }
  if (!args.jsonOut && !args.mdOut) process.stdout.write(markdown);
}

async function cmdLedger(rest: string[]): Promise<void> {
  const [subcmd] = rest;
  const ledgerFile = readFlag(rest, "--ledger");
  if (subcmd === "list" || !subcmd) {
    const entries = readSocialLedger(ledgerFile);
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
    return;
  }
  if (subcmd === "add") {
    const candidateFile = readFlag(rest, "--candidate-file");
    if (!candidateFile) throw new Error("ledger add requires --candidate-file");
    const candidate = selectCandidate(readBundle(candidateFile), readFlag(rest, "--candidate-id"));
    const postedAt = readFlag(rest, "--posted-at") ?? new Date().toISOString();
    const status = (readFlag(rest, "--status") ?? "posted") as "approved" | "posted" | "skipped";
    const entry = candidateToLedgerEntry(
      candidate,
      postedAt,
      readFlag(rest, "--post-url"),
      status,
      readFlag(rest, "--reason"),
    );
    appendSocialLedgerEntry(entry, ledgerFile);
    process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
    return;
  }
  throw new Error(`unknown ledger command: ${subcmd}`);
}

async function cmdPublish(rest: string[]): Promise<void> {
  const candidateFile = readFlag(rest, "--candidate-file");
  if (!candidateFile) throw new Error("publish requires --candidate-file");
  const candidate = selectCandidate(readBundle(candidateFile), readFlag(rest, "--candidate-id"));
  const dryRun = rest.includes("--dry-run");
  const includeLinkReply = !rest.includes("--no-link-reply");
  const allowReviewed = rest.includes("--allow-reviewed");
  const result = await publishSocialCandidate(candidate, { dryRun, includeLinkReply, allowReviewed });

  if (dryRun) {
    process.stdout.write(`# Dry run: ${candidate.id}\n\n`);
    result.posts.forEach((post, index) => {
      process.stdout.write(`## ${index + 1}. ${post.role}\n\n\`\`\`text\n${post.text}\n\`\`\`\n\n`);
    });
    return;
  }

  const main = result.published[0];
  if (!main) throw new Error("No post was published.");
  const ledgerFile = readFlag(rest, "--ledger");
  const entry = candidateToLedgerEntry(candidate, new Date().toISOString(), main.url, "posted");
  appendSocialLedgerEntry(entry, ledgerFile);
  process.stdout.write(`${JSON.stringify({ published: result.published, ledgerEntry: entry }, null, 2)}\n`);
}

async function cmdCheck(rest: string[]): Promise<void> {
  const result = runSocialCheck({
    siteUrl: readFlag(rest, "--site-url"),
    requireXCredentials: rest.includes("--require-x-credentials"),
  });
  process.stdout.write(formatSocialCheckResult(result));
  if (!result.ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "generate":
    case undefined:
      return cmdGenerate(rest);
    case "ledger":
      return cmdLedger(rest);
    case "publish":
      return cmdPublish(rest);
    case "check":
      return cmdCheck(rest);
    default:
      console.log(
        "commands:\n" +
          "  check [--site-url URL] [--require-x-credentials]\n" +
          "  generate [--kind KIND] [--schedule-id ID] [--json-out FILE] [--md-out FILE]\n" +
          "           [--ledger FILE] [--site-url URL] [--assets-dir DIR] [--include-recent]\n" +
          "  publish --candidate-file FILE [--candidate-id ID] [--dry-run] [--no-link-reply] [--allow-reviewed]\n" +
          "  ledger list [--ledger FILE]\n" +
          "  ledger add --candidate-file FILE [--candidate-id ID] [--status posted|approved|skipped]\n" +
          "             [--post-url URL] [--reason TEXT] [--posted-at ISO] [--ledger FILE]",
      );
  }
}

main().catch((err) => {
  console.error("\n✖", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
