import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// An explicit second run uses real corpus selection, never the short race fixtures.
// The normal E2E suite also runs the spec with its declared test fixtures.
process.env.E2E_SETTINGS_CORPUS = "2026-10-25.3";
const server = base.webServer;
if (server === undefined || Array.isArray(server)) throw new Error("Expected one isolated E2E server");
export default defineConfig({
  ...base,
  testMatch: "room-settings.spec.ts",
  webServer: {
    ...server,
    command: "node --import tsx e2e/prepare-database.ts && npm run db:import:corpus -w @incision/database -- --version 2026-10-25.3 && node --import tsx server.ts",
    env: { ...server.env, CI: "1", DATABASE_URL_UNPOOLED: process.env.E2E_DATABASE_URL ?? "", RACE_FIXTURE_TEXTS: "" },
  },
});
