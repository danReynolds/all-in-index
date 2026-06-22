import { ImageResponse } from "next/og";
import { getHolding } from "@/lib/data";
import { currentCall, displayStance } from "@/lib/calls";

export const alt = "What the besties said — The All-Index";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";

const STANCE_UI: Record<string, { label: string; color: string }> = {
  bull: { label: "Bullish", color: "#34d399" },
  bear: { label: "Bearish", color: "#fb7185" },
  mixed: { label: "Mixed", color: "#fbbf24" },
  neutral: { label: "Neutral", color: "#8d9a92" },
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { holding: h } = getHolding(slug);
  // No pill unless there's an actual open position — absence over a fake stance.
  const ds = h ? displayStance(h.theses) : "neutral";
  const stance = ds === "neutral" ? null : STANCE_UI[ds];
  const since = h?.market?.returns.since ?? null;
  const cc = h ? currentCall(h) : null;

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
          <div style={{ fontSize: 20, color: "#8d9a92", marginLeft: "auto" }}>
            what the besties said
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1 }}>{h?.company ?? slug}</div>
            {h?.ticker && (
              <div
                style={{
                  fontSize: 30,
                  color: "#b6c0b9",
                  backgroundColor: "#1a231e",
                  padding: "6px 18px",
                  borderRadius: 10,
                }}
              >
                {h.ticker}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {stance && (
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: stance.color,
                  border: `2px solid ${stance.color}`,
                  borderRadius: 999,
                  padding: "8px 26px",
                }}
              >
                {stance.label}
              </div>
            )}
            {since != null && (
              <div style={{ fontSize: 34, color: since >= 0 ? "#34d399" : "#fb7185", fontWeight: 700 }}>
                {`stock ${pct(since)} since first discussed`}
              </div>
            )}
            {since == null && (
              <div style={{ fontSize: 30, color: "#8d9a92" }}>private company · conviction tracked</div>
            )}
          </div>
          {cc && (
            <div style={{ fontSize: 26, color: "#8d9a92" }}>
              {`current call since ${cc.sinceDate}${cc.ret != null ? ` · ${pct(cc.ret)} since` : ""}`}
            </div>
          )}
        </div>

        <div style={{ fontSize: 24, color: "#68766e" }}>
          {`${h?.mentionCount ?? 0} takes · every quote sourced & timestamped · not financial advice`}
        </div>
      </div>
    ),
    { ...size },
  );
}
