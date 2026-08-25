import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Historical data imports (Sales Register etc.) can be a few MB.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
