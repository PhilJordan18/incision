import { defineConfig } from "drizzle-kit";

// Generation only: migrations are applied by scripts/migrate.ts, never with `drizzle-kit push`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  strict: true,
});
