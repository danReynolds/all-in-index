import type { Host } from "../types";

export type SocialKind =
  | "portfolio_pulse"
  | "receipt"
  | "open_duel"
  | "episode_recap"
  | "prediction_checkin"
  | "award"
  | "quarterly_report"
  | "performance_review";

export type SocialRisk = "low" | "medium" | "high";

export type SocialEvidenceType =
  | "index"
  | "holding"
  | "episode"
  | "insight"
  | "prediction"
  | "award";

export interface SocialEvidence {
  type: SocialEvidenceType;
  id: string;
  label: string;
  urlPath?: string;
  hosts?: Host[];
  quoteUsed?: boolean;
}

export interface SocialVisualStat {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}

export interface SocialVisual {
  kind: "scorecard_svg";
  title: string;
  subtitle?: string;
  stats: SocialVisualStat[];
  footer?: string;
  alt: string;
}

export interface SocialCandidate {
  id: string;
  scheduleId: string;
  kind: SocialKind;
  title: string;
  mainPost: string;
  threadPosts: string[];
  linkReply?: string;
  route?: string;
  url?: string;
  topicKey: string;
  risk: SocialRisk;
  reviewRequired: boolean;
  autoPublishEligible: boolean;
  createdAt: string;
  evidence: SocialEvidence[];
  visual?: SocialVisual;
  policyNotes: string[];
}

export interface SkippedSocialCandidate {
  scheduleId: string;
  kind: SocialKind;
  reason: string;
}

export interface SocialDraftBundle {
  generatedAt: string;
  siteUrl: string;
  candidates: SocialCandidate[];
  skipped: SkippedSocialCandidate[];
}

export interface SocialLedgerEntry {
  id: string;
  status: "approved" | "posted" | "skipped";
  candidateId?: string;
  scheduleId?: string;
  kind: SocialKind;
  topicKey: string;
  textHash: string;
  postedAt: string;
  postUrl?: string;
  reason?: string;
}
