import type { SocialCandidate, SocialDraftBundle } from "./types";
import { containsUrl } from "./policy";
import { visualAssetFilename } from "./visual";

function boolLabel(value: boolean): string {
  return value ? "yes" : "no";
}

function evidenceLine(candidate: SocialCandidate): string {
  if (candidate.evidence.length === 0) return "none";
  return candidate.evidence
    .map((e) => `${e.type}:${e.id}${e.urlPath ? ` (${e.urlPath})` : ""}`)
    .join(", ");
}

function fenced(label: string, text: string): string {
  return [`**${label}**`, "", "```text", text, "```"].join("\n");
}

export function renderSocialDraftsMarkdown(bundle: SocialDraftBundle): string {
  const lines: string[] = [
    `# Social Drafts (${bundle.generatedAt.slice(0, 10)})`,
    "",
    `Generated: ${bundle.generatedAt}`,
    `Site: ${bundle.siteUrl}`,
    "",
    "Review the copy, evidence, and policy notes before publishing. Main posts should normally remain link-free.",
    "",
  ];

  if (bundle.candidates.length === 0) {
    lines.push("No fresh social candidates generated.");
  }

  for (const candidate of bundle.candidates) {
    lines.push(
      `## ${candidate.title}`,
      "",
      `- ID: \`${candidate.id}\``,
      `- Schedule: \`${candidate.scheduleId}\``,
      `- Type: \`${candidate.kind}\``,
      `- Risk: \`${candidate.risk}\``,
      `- Review required: ${boolLabel(candidate.reviewRequired)}`,
      `- Auto-publish eligible: ${boolLabel(candidate.autoPublishEligible)}`,
      `- Main post has URL: ${boolLabel(containsUrl(candidate.mainPost))}`,
      `- Route: ${candidate.route ?? "none"}`,
      `- Evidence: ${evidenceLine(candidate)}`,
      candidate.visual ? `- Suggested visual: \`${visualAssetFilename(candidate)}\` (${candidate.visual.alt})` : "- Suggested visual: none",
      "",
      fenced("Main post", candidate.mainPost),
      "",
    );
    candidate.threadPosts.forEach((post, index) => {
      lines.push(fenced(`Thread post ${index + 2}`, post), "");
    });
    if (candidate.linkReply) {
      lines.push(fenced("Link reply", candidate.linkReply), "");
    }
    if (candidate.policyNotes.length) {
      lines.push("**Policy notes**", "");
      for (const note of candidate.policyNotes) lines.push(`- ${note}`);
      lines.push("");
    }
  }

  if (bundle.skipped.length) {
    lines.push("## Skipped", "");
    for (const skipped of bundle.skipped) {
      lines.push(`- \`${skipped.scheduleId}\` (${skipped.kind}): ${skipped.reason}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
