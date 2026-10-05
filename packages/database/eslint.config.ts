import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(tseslint.configs.recommended, {
  rules: {
    // TECH-02: explicit `any` is forbidden, not merely discouraged.
    "@typescript-eslint/no-explicit-any": "error",
  },
});
