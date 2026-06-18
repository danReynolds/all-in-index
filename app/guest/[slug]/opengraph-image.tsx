import { ImageResponse } from "next/og";
import { getIndex } from "@/lib/data";

export const alt = "Guest call record — The All-Index";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";

/** Initials for the monogram avatar (mirrors the guest page). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { snapshot } = getIndex();
  const entry = (snapshot.guestLeaderboard ?? []).find((g) => g.slug === slug);
  const name = entry?.guest ?? slug;
  const violet = "#8b5cf6";

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
          backgroundImage: `radial-gradient(800px 400px at 80% -10%, ${violet}33, transparent 60%)`,
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
            guest call record
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div
            style={{
              width: 130,
              height: 130,
              borderRadius: 28,
              backgroundColor: `${violet}26`,
              border: `2px solid ${violet}55`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#c4b5fd",
              fontSize: 56,
              fontWeight: 800,
            }}
          >
            {initials(name)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.05, display: "flex" }}>
              {name}
            </div>
            <div
              style={{
                fontSize: 86,
                fontWeight: 800,
                lineHeight: 1.05,
                color: entry && entry.followReturn >= 0 ? "#34d399" : "#fb7185",
              }}
            >
              {entry ? pct(entry.followReturn) : "—"}
            </div>
            <div style={{ fontSize: 28, color: "#b6c0b9", display: "flex" }}>
              {entry
                ? `vs S&P ${pct(entry.benchmarkReturn)} · ${entry.calls} scored ${entry.calls === 1 ? "call" : "calls"}, if you'd followed each one`
                : "no scored calls yet"}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 24, color: "#8d9a92", display: "flex" }}>
          Every guest call on the All-In podcast · sourced & timestamped · not financial advice
        </div>
      </div>
    ),
    { ...size },
  );
}
