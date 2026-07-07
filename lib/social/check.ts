import fs from "node:fs";
import path from "node:path";
import { getIndex } from "../data";
import { containsUrl, X_STANDARD_POST_LIMIT } from "./policy";
import { generateSocialCandidates, type PredictionsFileLike } from "./generate";
import { readSocialLedger } from "./ledger";
import { renderCandidateVisualSvg } from "./visual";
import type { SocialDraftBundle, SocialKind } from "./types";

interface ScheduleFile {
  version: number;
  defaults?: { maxAutoPostsPerDay?: number; minDaysBetweenSimilarTopics?: number };
  slots: Array<{
    id: string;
    kind: SocialKind;
    reviewRequired?: boolean;
    autoPublishEligible?: boolean;
  }>;
}

export interface SocialCheckOptions {
  siteUrl?: string;
  requireXCredentials?: boolean;
}

export interface SocialCheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  checkedScheduleIds: string[];
}

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function loadPredictions(): PredictionsFileLike | null {
  const file = path.join(process.cwd(), "data", "predictions.json");
  if (!fs.existsSync(file)) return null;
  return loadJson<PredictionsFileLike>(file);
}

function hasXCredentials(): boolean {
  const oauth1 = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"].every(
    (key) => Boolean(process.env[key]),
  );
  return oauth1 || Boolean(process.env.X_BEARER_TOKEN);
}

function candidateText(bundle: SocialDraftBundle): string {
  return bundle.candidates
    .flatMap((candidate) => [candidate.mainPost, ...candidate.threadPosts, candidate.linkReply ?? ""])
    .join("\n");
}

export function runSocialCheck(options: SocialCheckOptions = {}): SocialCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const schedule = loadJson<ScheduleFile>(path.join(process.cwd(), "social", "schedule.json"));
  const scheduleIds = new Set<string>();
  const { snapshot } = getIndex();
  const predictions = loadPredictions();
  const ledger = readSocialLedger();

  if (!schedule.slots.length) errors.push("social/schedule.json has no slots.");
  for (const slot of schedule.slots) {
    if (scheduleIds.has(slot.id)) errors.push(`Duplicate schedule id: ${slot.id}`);
    scheduleIds.add(slot.id);
  }
  if ((schedule.defaults?.maxAutoPostsPerDay ?? 0) > 1) {
    warnings.push("maxAutoPostsPerDay is above 1; reconsider before enabling auto-publish.");
  }

  for (const slot of schedule.slots) {
    if (slot.kind === "performance_review") continue;
    const bundle = generateSocialCandidates(snapshot, {
      siteUrl: options.siteUrl,
      scheduleIds: [slot.id],
      includeRecentlyUsed: true,
      ledgerEntries: ledger,
      predictions,
    });
    if (bundle.candidates.length !== 1) {
      errors.push(`Expected exactly one candidate for ${slot.id}, got ${bundle.candidates.length}.`);
      continue;
    }
    const candidate = bundle.candidates[0];
    if (candidate.kind !== slot.kind) {
      errors.push(`${slot.id} generated kind ${candidate.kind}, expected ${slot.kind}.`);
    }
    if (containsUrl(candidate.mainPost)) {
      errors.push(`${candidate.id} main post contains a URL.`);
    }
    for (const [index, post] of [candidate.mainPost, ...candidate.threadPosts, candidate.linkReply ?? ""].entries()) {
      if (post.length > X_STANDARD_POST_LIMIT) {
        errors.push(`${candidate.id} post ${index + 1} is ${post.length} chars; standard limit is ${X_STANDARD_POST_LIMIT}.`);
      }
    }
    if (slot.autoPublishEligible && candidate.reviewRequired) {
      errors.push(`${slot.id} is auto-publish eligible in schedule but generated reviewRequired=true.`);
    }
    if (slot.autoPublishEligible && !candidate.autoPublishEligible) {
      errors.push(`${slot.id} is auto-publish eligible in schedule but candidate autoPublishEligible=false.`);
    }
    if (/\bdraft\b/i.test(candidateText(bundle))) {
      errors.push(`${candidate.id} public copy contains internal workflow language.`);
    }
    if (candidate.visual && !renderCandidateVisualSvg(candidate)) {
      errors.push(`${candidate.id} declares a visual but could not render it.`);
    }
  }

  if (!hasXCredentials()) {
    const message = "X credentials are not configured; dry-run workflows can run, real publish cannot.";
    if (options.requireXCredentials) errors.push(message);
    else warnings.push(message);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checkedScheduleIds: [...scheduleIds].sort(),
  };
}

export function formatSocialCheckResult(result: SocialCheckResult): string {
  const lines = [
    result.ok ? "social check: ok" : "social check: failed",
    `checked schedules: ${result.checkedScheduleIds.join(", ")}`,
  ];
  if (result.errors.length) {
    lines.push("", "Errors:");
    for (const error of result.errors) lines.push(`- ${error}`);
  }
  if (result.warnings.length) {
    lines.push("", "Warnings:");
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join("\n")}\n`;
}
