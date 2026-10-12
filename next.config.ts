import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app shows pages in its own tabs (iframes) - allowed for this site
  // only, never inside another site's page.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] }];
  },
  // Keep each deployment small (Vercel caps the stored size of all kept
  // deployments): Prisma ships WebAssembly engines for every database for
  // edge runtimes; on Node the app only uses the native Postgres engine.
  outputFileTracingExcludes: {
    "**": [
      "node_modules/@prisma/client/runtime/*.wasm",
      "node_modules/@prisma/client/runtime/query_engine_bg.*",
      "node_modules/@prisma/client/runtime/query_compiler_bg.*",
      "node_modules/@prisma/engines/**",
      "node_modules/prisma/**",
    ],
  },
  experimental: {
    serverActions: {
      // Historical data imports (Sales Register etc.) can be a few MB.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
