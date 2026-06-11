import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The index page used to live at /index, but a literal "index" route
      // collides with Next's root-route output naming on Vercel.
      { source: "/index", destination: "/the-index", permanent: true },
    ];
  },
};

export default nextConfig;
