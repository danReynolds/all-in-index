import { ImageResponse } from "next/og";
import { getIndex } from "@/lib/data";

export const alt = "The All-Index — every All-In call, scored";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";

export default async function Image() {
  const { snapshot } = getIndex();
  const fund = snapshot.indexFund;

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
          backgroundImage: "radial-gradient(800px 400px at 80% -10%, rgba(16,185,129,0.18), transparent 60%)",
          color: "#e9eeeb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              backgroundColor: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#022c22",
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            AI
          </div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>The All-Index</div>
          <div style={{ fontSize: 20, color: "#8d9a92", marginLeft: "auto" }}>unofficial</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 26, letterSpacing: 4, color: "#34d399", fontWeight: 700 }}>
            THE BESTIES INDEX
          </div>
          <div style={{ fontSize: 130, fontWeight: 800, color: "#34d399", lineHeight: 1 }}>
            {fund ? pct(fund.portfolioReturn) : "—"}
          </div>
          <div style={{ fontSize: 30, color: "#b6c0b9" }}>
            {fund
              ? `vs the S&P's ${pct(fund.benchmarkReturn)} · ${fund.constituents.length} open bullish calls, held to today`
              : "Every All-In call, scored"}
          </div>
        </div>

        <div style={{ fontSize: 24, color: "#68766e" }}>
          Every call on the All-In podcast — extracted, attributed, and scored against the market.
        </div>
      </div>
    ),
    { ...size },
  );
}
