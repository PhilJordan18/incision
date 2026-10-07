import { defineConfig } from "vitest/config";

// Integration tests against a disposable local or CI PostgreSQL (TEST_DATABASE_URL).
export default defineConfig({
  test: {
    include: ["test/**/*.db.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
