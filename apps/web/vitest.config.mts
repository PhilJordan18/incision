import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // next-auth imports `next/server` without an extension, which Node's ESM resolver
    // refuses; letting Vite process it resolves the import as Next's bundler does.
    server: { deps: { inline: ["next-auth"] } },
  },
});
