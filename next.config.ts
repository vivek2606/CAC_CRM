import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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

// Error alerts (docs/ERROR-ALERTS.md). Readable stack traces in Sentry need
// SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT at build time; without
// them errors are still reported.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
});
