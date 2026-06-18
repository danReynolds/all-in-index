import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baseline hardening headers for a static content site: block framing
  // (clickjacking), MIME-sniffing, and leaking full referrers cross-origin.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // The index page used to live at /index, but a literal "index" route
      // collides with Next's root-route output naming on Vercel.
      { source: "/index", destination: "/the-index", permanent: true },
      // The insights page was originally shipped as /signals.
      { source: "/signals", destination: "/insights", permanent: true },
    ];
  },
};

export default nextConfig;
