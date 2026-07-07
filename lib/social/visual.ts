import fs from "node:fs";
import path from "node:path";
import type { SocialCandidate, SocialDraftBundle, SocialVisualStat } from "./types";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toneColor(tone: SocialVisualStat["tone"]): string {
  if (tone === "positive") return "#34d399";
  if (tone === "negative") return "#fb7185";
  return "#e5e7eb";
}

export function visualAssetFilename(candidate: SocialCandidate): string {
  return `${candidate.id.replace(/[^a-zA-Z0-9._-]+/g, "-")}.svg`;
}

export function renderCandidateVisualSvg(candidate: SocialCandidate): string | null {
  const visual = candidate.visual;
  if (!visual || visual.kind !== "scorecard_svg") return null;
  const stats = visual.stats.slice(0, 4);
  const cardWidth = 1600;
  const cardHeight = 900;
  const statWidth = 340;
  const gap = 28;
  const totalStatsWidth = stats.length * statWidth + Math.max(0, stats.length - 1) * gap;
  const startX = (cardWidth - totalStatsWidth) / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}" role="img" aria-label="${escapeXml(visual.alt)}">
  <rect width="${cardWidth}" height="${cardHeight}" fill="#111827"/>
  <rect x="48" y="48" width="1504" height="804" rx="32" fill="#f8fafc"/>
  <rect x="88" y="88" width="1424" height="724" rx="24" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
  <text x="128" y="174" fill="#059669" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" letter-spacing="2">THE ALL-INDEX</text>
  <text x="128" y="292" fill="#111827" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="800">${escapeXml(visual.title)}</text>
  ${visual.subtitle ? `<text x="128" y="360" fill="#4b5563" font-family="Arial, Helvetica, sans-serif" font-size="34">${escapeXml(visual.subtitle)}</text>` : ""}
  ${stats
    .map((stat, index) => {
      const x = startX + index * (statWidth + gap);
      return `<g>
    <rect x="${x}" y="462" width="${statWidth}" height="190" rx="18" fill="#111827"/>
    <text x="${x + 28}" y="530" fill="#9ca3af" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="1">${escapeXml(stat.label.toUpperCase())}</text>
    <text x="${x + 28}" y="604" fill="${toneColor(stat.tone)}" font-family="Arial, Helvetica, sans-serif" font-size="50" font-weight="800">${escapeXml(stat.value)}</text>
  </g>`;
    })
    .join("\n  ")}
  <line x1="128" y1="710" x2="1472" y2="710" stroke="#e5e7eb" stroke-width="2"/>
  <text x="128" y="768" fill="#4b5563" font-family="Arial, Helvetica, sans-serif" font-size="28">${escapeXml(visual.footer ?? "Scoreboard, not financial advice.")}</text>
</svg>
`;
}

export function writeCandidateVisualAssets(bundle: SocialDraftBundle, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const candidate of bundle.candidates) {
    const svg = renderCandidateVisualSvg(candidate);
    if (!svg) continue;
    const file = path.join(outDir, visualAssetFilename(candidate));
    fs.writeFileSync(file, svg);
    written.push(file);
  }
  return written;
}
