import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { staleTimes: { dynamic: 120, static: 300 } },
  distDir: process.env.EVAORBIT_NEXT_DIST_DIR || ".next",
  outputFileTracingIncludes: {
    "/*": ["./SELF_PERSONA.md"],
    "/api/reicon{,/*}": ["./node_modules/reicon-react/icons/*.js"],
    "/api/calendar-interpretation": ["./node_modules/reicon-react/icons/*.js"],
  },
};

export default nextConfig;
