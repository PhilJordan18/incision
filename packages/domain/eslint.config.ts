import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * The engine stays pure: same input, same output, on the server, in a bot and in the browser.
 * The clock and the seed are parameters; nothing reads the time, draws at random, schedules,
 * talks to the network or the disk, or reaches into the application or the database.
 */
const IMPURE = "The engine is pure: take the instant or the seed as a parameter (brief v3, §6.2).";
const OUTSIDE = "The engine never reaches the network, the disk, the database or the application (brief v3, §6.2).";

export default defineConfig(tseslint.configs.recommended, {
  rules: {
    // TECH-02: explicit `any` is forbidden, not merely discouraged.
    "@typescript-eslint/no-explicit-any": "error",
    "no-restricted-properties": [
      "error",
      { object: "Date", property: "now", message: IMPURE },
      { object: "Math", property: "random", message: IMPURE },
      { object: "performance", property: "now", message: IMPURE },
      { object: "crypto", property: "getRandomValues", message: IMPURE },
      { object: "crypto", property: "randomUUID", message: IMPURE },
    ],
    "no-restricted-syntax": [
      "error",
      { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: IMPURE },
      { selector: "CallExpression[callee.name='Date'][arguments.length=0]", message: IMPURE },
    ],
    "no-restricted-globals": [
      "error",
      ...["setTimeout", "setInterval", "setImmediate", "queueMicrotask", "performance"].map((name) => ({ name, message: IMPURE })),
      ...["fetch", "process", "XMLHttpRequest", "WebSocket", "window", "document", "localStorage"].map((name) => ({ name, message: OUTSIDE })),
    ],
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "node:*", "fs", "fs/*", "net", "http", "https", "child_process", "worker_threads",
              "pg", "pg/*", "drizzle-orm", "drizzle-orm/*", "socket.io", "socket.io/*", "socket.io-client",
              "next", "next/*", "react", "react/*",
              "@incision/database", "@incision/database/*", "**/apps/**", "**/packages/database/**",
            ],
            message: OUTSIDE,
          },
        ],
      },
    ],
  },
});
