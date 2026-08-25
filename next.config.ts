import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.EVAORBIT_NEXT_DIST_DIR || ".next",
  outputFileTracingIncludes: {
    "/*": ["./SELF_PERSONA.md"],
  },
};

export default nextConfig;
