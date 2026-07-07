import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SocialCandidate, SocialLedgerEntry } from "./types";

export const DEFAULT_LEDGER_FILE = path.join(process.cwd(), "social", "ledger.json");

export function hashCandidateText(candidate: Pick<SocialCandidate, "mainPost" | "threadPosts" | "linkReply">): string {
  const text = [candidate.mainPost, ...candidate.threadPosts, candidate.linkReply ?? ""].join("\n---\n");
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function candidateToLedgerEntry(
  candidate: SocialCandidate,
  postedAt = new Date().toISOString(),
  postUrl?: string,
  status: SocialLedgerEntry["status"] = "posted",
  reason?: string,
): SocialLedgerEntry {
  return {
    id: `${postedAt.slice(0, 10)}:${candidate.id}`,
    status,
    candidateId: candidate.id,
    scheduleId: candidate.scheduleId,
    kind: candidate.kind,
    topicKey: candidate.topicKey,
    textHash: hashCandidateText(candidate),
    postedAt,
    postUrl,
    reason,
  };
}

export function readSocialLedger(file = DEFAULT_LEDGER_FILE): SocialLedgerEntry[] {
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`Social ledger must be an array: ${file}`);
  return parsed as SocialLedgerEntry[];
}

export function writeSocialLedger(entries: SocialLedgerEntry[], file = DEFAULT_LEDGER_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`);
}

export function wasRecentlyUsed(
  candidate: SocialCandidate,
  entries: SocialLedgerEntry[],
  now = new Date(),
  minDaysBetweenSimilarTopics = 14,
): boolean {
  const cutoffMs = now.getTime() - minDaysBetweenSimilarTopics * 86_400_000;
  const textHash = hashCandidateText(candidate);
  return entries.some((entry) => {
    const postedAt = Date.parse(entry.postedAt);
    if (!Number.isFinite(postedAt) || postedAt < cutoffMs) return false;
    if (entry.status === "skipped") return false;
    return entry.topicKey === candidate.topicKey || entry.textHash === textHash;
  });
}

export function filterFreshCandidates(
  candidates: SocialCandidate[],
  entries: SocialLedgerEntry[],
  now = new Date(),
  minDaysBetweenSimilarTopics = 14,
): { fresh: SocialCandidate[]; skipped: Array<{ candidate: SocialCandidate; reason: string }> } {
  const fresh: SocialCandidate[] = [];
  const skipped: Array<{ candidate: SocialCandidate; reason: string }> = [];
  for (const candidate of candidates) {
    if (wasRecentlyUsed(candidate, entries, now, minDaysBetweenSimilarTopics)) {
      skipped.push({ candidate, reason: `topic or text used within ${minDaysBetweenSimilarTopics} days` });
    } else {
      fresh.push(candidate);
    }
  }
  return { fresh, skipped };
}

export function appendSocialLedgerEntry(
  entry: SocialLedgerEntry,
  file = DEFAULT_LEDGER_FILE,
): SocialLedgerEntry[] {
  const entries = readSocialLedger(file);
  const next = entries.filter((existing) => existing.id !== entry.id);
  next.push(entry);
  next.sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.id.localeCompare(b.id));
  writeSocialLedger(next, file);
  return next;
}
