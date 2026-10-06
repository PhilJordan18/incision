import { defineConfig } from "vitest/config";

// Unit tests only; database tests need TEST_DATABASE_URL (vitest.db.config.mts).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
