import { ImageResponse } from "next/og";
import { getIndex } from "@/lib/data";
import { HOST_PROFILES, REGULAR_HOSTS } from "@/lib/types";
import type { Host } from "@/lib/types";

export const alt = "Bestie track record — The All-Index";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
const HOST_HEX: Record<string, string> = {
  Chamath: "#f59e0b",
  Jason: "#0ea5e9",
  Sacks: "#8b5cf6",
  Friedberg: "#14b8a6",
};

export default async function Image({ params }: { params: Promise<{ host: string }> }) {
  const { host: hostParam } = await params;
  const host = (REGULAR_HOSTS.find((h) => h.toLowerCase() === hostParam.toLowerCase()) ??
    "Chamath") as Host;
  const { snapshot } = getIndex();
  const entry = (snapshot.leaderboard ?? []).find((e) => e.host === host);
  const rank = (snapshot.leaderboard ?? []).findIndex((e) => e.host === host) + 1;
  const profile = HOST_PROFILES[host as keyof typeof HOST_PROFILES];
  const hex = HOST_HEX[host] ?? "#10b981";

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
          backgroundImage: `radial-gradient(800px 400px at 80% -10%, ${hex}33, transparent 60%)`,
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
            bestie track record
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div
            style={{
              width: 130,
              height: 130,
              borderRadius: 28,
              backgroundColor: hex,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: 64,
              fontWeight: 800,
            }}
          >
            {host.charAt(0)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>
              {`${profile?.fullName ?? host} ${rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : ""}`}
            </div>
            <div
              style={{
                fontSize: 86,
                fontWeight: 800,
                lineHeight: 1.05,
                color: entry && entry.portfolioReturn >= 0 ? "#34d399" : "#fb7185",
              }}
            >
              {entry ? pct(entry.portfolioReturn) : "—"}
            </div>
            <div style={{ fontSize: 28, color: "#b6c0b9" }}>
              {entry
                ? `vs S&P ${pct(entry.benchmarkReturn)} · ${entry.positions} calls, over their own windows`
                : "no calls yet"}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 24, color: "#68766e" }}>
          In the market on clear buys, ranked picks, and selections · every call sourced · not financial advice
        </div>
      </div>
    ),
    { ...size },
  );
}
