import { defineConfig } from "vitest/config";

// Integration tests (F-04.0): real server processes of the production build (`next build` first)
// against a disposable local database; see integration/servers.ts.
export default defineConfig({
  test: {
    include: ["integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    server: { deps: { inline: ["next-auth"] } },
  },
});
