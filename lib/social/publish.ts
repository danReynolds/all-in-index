import type { SocialCandidate } from "./types";
import { createXPost, type XPostResult } from "./x";

export type PublishPostRole = "main" | "thread" | "link_reply";

export interface PublishPost {
  role: PublishPostRole;
  text: string;
}

export interface PublishResult {
  dryRun: boolean;
  posts: PublishPost[];
  published: Array<PublishPost & XPostResult>;
}

export interface PublishSafetyOptions {
  /**
   * Allows a human-reviewed candidate that is not auto-publish eligible to be
   * published manually. Dry runs never need this override.
   */
  allowReviewed?: boolean;
}

export function buildPublishPosts(
  candidate: SocialCandidate,
  options: { includeLinkReply?: boolean } = {},
): PublishPost[] {
  const includeLinkReply = options.includeLinkReply ?? true;
  const posts: PublishPost[] = [
    { role: "main", text: candidate.mainPost },
    ...candidate.threadPosts.map((text): PublishPost => ({ role: "thread", text })),
  ];
  if (includeLinkReply && candidate.linkReply) posts.push({ role: "link_reply", text: candidate.linkReply });
  return posts;
}

export function assertCandidatePublishable(
  candidate: SocialCandidate,
  options: PublishSafetyOptions = {},
): void {
  if (candidate.autoPublishEligible && !candidate.reviewRequired) return;
  if (options.allowReviewed) return;
  const reasons = [
    candidate.reviewRequired ? "reviewRequired=true" : null,
    candidate.autoPublishEligible ? null : "autoPublishEligible=false",
  ].filter(Boolean);
  throw new Error(
    `Candidate ${candidate.id} is not safe for non-dry-run publish without --allow-reviewed (${reasons.join(", ")}).`,
  );
}

export async function publishSocialCandidate(
  candidate: SocialCandidate,
  options: { dryRun?: boolean; includeLinkReply?: boolean; allowReviewed?: boolean } = {},
): Promise<PublishResult> {
  const posts = buildPublishPosts(candidate, { includeLinkReply: options.includeLinkReply });
  if (options.dryRun) return { dryRun: true, posts, published: [] };
  assertCandidatePublishable(candidate, { allowReviewed: options.allowReviewed });

  const published: PublishResult["published"] = [];
  let replyToId: string | undefined;
  for (const post of posts) {
    const result = await createXPost({ text: post.text, replyToId });
    published.push({ ...post, ...result });
    replyToId = result.id;
  }
  return { dryRun: false, posts, published };
}
