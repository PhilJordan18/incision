import { randomBytes } from "node:crypto";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The E2E flows run the production build through the custom server (server.ts), against a
// disposable local database rebuilt at every run. No real OAuth credential is used:
// provider sign-ins are followed only up to the provider's authorisation URL.
const port = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://localhost:${port}`;
// One fresh secret per run, shared with the tests (they forge expired or tampered cookies).
process.env.E2E_AUTH_SECRET ??= randomBytes(32).toString("base64url");
process.env.E2E_DATABASE_URL ??= "postgresql://incision_test:incision_test_only@localhost:5433/incision_e2e";
// Point E2E_SERVER_DIR at the apps/web folder of an unpacked release archive to test what is deployed.
const serverDir = process.env.E2E_SERVER_DIR ?? __dirname;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  reporter: process.env.CI !== undefined ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node --import tsx ${path.join(__dirname, "e2e", "prepare-database.ts")} && node --import tsx server.ts`,
    cwd: serverDir,
    url: `${baseURL}/api/health/live`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    env: {
      NODE_ENV: "production",
      PORT: String(port),
      APP_URL: baseURL,
      AUTH_URL: baseURL,
      AUTH_SECRET: process.env.E2E_AUTH_SECRET,
      DATABASE_URL: process.env.E2E_DATABASE_URL,
      E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
      TRUSTED_PROXY_HOPS: "0",
      // Placeholders, not credentials: the tests never complete an OAuth round trip.
      AUTH_GITHUB_ID: "e2e-github-client-id",
      AUTH_GITHUB_SECRET: "e2e-placeholder-not-a-secret",
      AUTH_DISCORD_ID: "e2e-discord-client-id",
      AUTH_DISCORD_SECRET: "e2e-placeholder-not-a-secret",
    },
  },
});
