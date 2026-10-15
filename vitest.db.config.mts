import { defineConfig } from "vitest/config";
import path from "node:path";

// DB integration tests. Env is loaded by `node --env-file-if-exists=.env.local`
// (see package.json); suites skip themselves when SUPABASE_DB_URL is absent.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(import.meta.dirname, "tests/db/server-only-shim.ts"),
    },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
