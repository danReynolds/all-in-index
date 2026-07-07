import type { SocialCandidate, SocialRisk } from "./types";

export const X_STANDARD_POST_LIMIT = 280;

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i;
const MENTION_RE = /(^|\s)@[A-Za-z0-9_]{1,15}\b/;

export interface SocialPolicyOptions {
  allowMainPostUrl?: boolean;
  maxPostLength?: number;
}

export function containsUrl(text: string): boolean {
  return URL_RE.test(text);
}

export function containsMention(text: string): boolean {
  return MENTION_RE.test(text);
}

function maxRisk(a: SocialRisk, b: SocialRisk): SocialRisk {
  if (a === "high" || b === "high") return "high";
  if (a === "medium" || b === "medium") return "medium";
  return "low";
}

export function applySocialPolicy(
  candidate: SocialCandidate,
  options: SocialPolicyOptions = {},
): SocialCandidate {
  const maxPostLength = options.maxPostLength ?? X_STANDARD_POST_LIMIT;
  const notes = [...candidate.policyNotes];
  let risk = candidate.risk;
  let reviewRequired = candidate.reviewRequired;
  let autoPublishEligible = candidate.autoPublishEligible;

  if (containsUrl(candidate.mainPost) && !options.allowMainPostUrl) {
    notes.push("Main post contains a URL; default policy keeps URLs in replies.");
    risk = maxRisk(risk, "high");
    reviewRequired = true;
    autoPublishEligible = false;
  }

  const posts = [candidate.mainPost, ...candidate.threadPosts];
  if (candidate.linkReply) posts.push(candidate.linkReply);
  posts.forEach((post, index) => {
    if (post.length > maxPostLength) {
      notes.push(`Post ${index + 1} is ${post.length} chars; standard X limit is ${maxPostLength}.`);
      risk = maxRisk(risk, "medium");
      reviewRequired = true;
      autoPublishEligible = false;
    }
    if (containsMention(post)) {
      notes.push(`Post ${index + 1} contains an @ mention; automated mentions require review.`);
      risk = maxRisk(risk, "high");
      reviewRequired = true;
      autoPublishEligible = false;
    }
  });

  if (candidate.evidence.some((e) => e.quoteUsed)) {
    notes.push("Candidate uses quote evidence; review for attribution, excerpt length, and tone.");
    risk = maxRisk(risk, "medium");
    reviewRequired = true;
    autoPublishEligible = false;
  }

  return {
    ...candidate,
    risk,
    reviewRequired,
    autoPublishEligible,
    policyNotes: [...new Set(notes)],
  };
}
