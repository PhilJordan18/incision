import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * The engine stays pure: same input, same output, on the server, in a bot and in the browser.
 * The clock and the seed are parameters; nothing reads the time, draws at random, schedules,
 * talks to the network or the disk, or reaches into the application or the database.
 * The other half of the guard is `tsconfig.json`: `types: []` and no DOM library, so Node and
 * browser globals do not even type-check here. See packages/domain/README.md.
 */
const IMPURE = "The engine is pure: take the instant or the seed as a parameter (packages/domain/README.md).";
const OUTSIDE = "The engine never reaches the network, the disk, the database or the application (packages/domain/README.md).";
const AMBIENT = /^(Math|Date|performance|crypto|globalThis|global)$/;

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
      // Indirect access would slip past the rules above.
      { selector: "Identifier[name=/^(globalThis|global)$/]", message: IMPURE },
      { selector: `VariableDeclarator > Identifier.init[name=${AMBIENT}]`, message: IMPURE },
      { selector: `AssignmentExpression > Identifier.right[name=${AMBIENT}]`, message: IMPURE },
      { selector: "ImportExpression", message: OUTSIDE },
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
              "node:*", "fs", "fs/*", "net", "http", "https", "http2", "child_process", "worker_threads", "cluster",
              "crypto", "os", "path", "url", "util", "stream", "events", "buffer", "dns", "tls", "zlib", "vm",
              "perf_hooks", "timers", "timers/*", "readline",
              "pg", "pg/*", "drizzle-orm", "drizzle-orm/*", "socket.io", "socket.io/*", "socket.io-client",
              "next", "next/*", "react", "react/*",
              "@incision/database", "@incision/database/*", "@incision/web", "@incision/web/*",
              "**/apps/**", "**/database", "**/database/**",
            ],
            message: OUTSIDE,
          },
        ],
      },
    ],
  },
});
