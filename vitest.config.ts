import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests (tests/unit) need nothing; database tests (tests/db) run
// against TEST_DATABASE_URL - a throwaway database, reset before the run
// (tests/global-setup.ts) - and are skipped when it isn't set.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // Database tests share one database: one file at a time.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
