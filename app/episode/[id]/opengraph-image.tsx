import { ImageResponse } from "next/og";
import { getEpisode } from "@/lib/data";

export const alt = "Episode scorecard — The All-Index";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ep = getEpisode(id);
  const num = ep?.meta.number ? `E${ep.meta.number}` : "Special";
  const title = ep?.meta.title ?? id;
  const takes = ep ? ep.groups.reduce((n, g) => n + g.takes.length, 0) : 0;
  const companies = ep?.groups.length ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          backgroundColor: "#0a0f0c",
          backgroundImage: "radial-gradient(800px 400px at 80% -10%, rgba(16,185,129,0.15), transparent 60%)",
          color: "#e9eeeb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              backgroundColor: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#022c22",
              fontSize: 16,
              fontWeight: 800,
            }}
          >
            AI
          </div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>The All-Index</div>
          <div style={{ fontSize: 20, color: "#8d9a92", marginLeft: "auto" }}>episode scorecard</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 26, color: "#34d399", fontWeight: 700 }}>{num}</div>
          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.05, display: "flex" }}>
            {title.length > 90 ? title.slice(0, 88) + "…" : title}
          </div>
        </div>

        <div style={{ fontSize: 24, color: "#8d9a92", display: "flex" }}>
          {`${takes} scored ${takes === 1 ? "take" : "takes"} across ${companies} ${companies === 1 ? "company" : "companies"} · each judged by the price move since it aired · not financial advice`}
        </div>
      </div>
    ),
    { ...size },
  );
}
