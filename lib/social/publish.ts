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

export async function publishSocialCandidate(
  candidate: SocialCandidate,
  options: { dryRun?: boolean; includeLinkReply?: boolean } = {},
): Promise<PublishResult> {
  const posts = buildPublishPosts(candidate, { includeLinkReply: options.includeLinkReply });
  if (options.dryRun) return { dryRun: true, posts, published: [] };

  const published: PublishResult["published"] = [];
  let replyToId: string | undefined;
  for (const post of posts) {
    const result = await createXPost({ text: post.text, replyToId });
    published.push({ ...post, ...result });
    replyToId = result.id;
  }
  return { dryRun: false, posts, published };
}
