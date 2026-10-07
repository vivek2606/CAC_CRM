import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app shows pages in its own tabs (iframes) - allowed for this site
  // only, never inside another site's page.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] }];
  },
  experimental: {
    serverActions: {
      // Historical data imports (Sales Register etc.) can be a few MB.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
