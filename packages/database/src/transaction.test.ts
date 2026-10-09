import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUERY_TIMEOUT_MS } from "./pool";
import { SERVER_LIMITS_MS } from "./transaction";

describe("SERVER_LIMITS_MS", () => {
  it("ends every server-side wait before the client's own timeout", () => {
    for (const limit of Object.values(SERVER_LIMITS_MS)) {
      expect(limit).toBeLessThan(QUERY_TIMEOUT_MS);
    }
  });
});

describe("boundedTransaction", () => {
  it("is the only way the package opens a transaction, so none forgets the server limits", () => {
    const sources = readdirSync(new URL(".", import.meta.url), { recursive: true, encoding: "utf8" }).filter(
      (file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "transaction.ts",
    );
    const direct = sources.filter((file) => readFileSync(new URL(file, import.meta.url), "utf8").includes(".transaction("));
    expect(direct).toEqual([]);
  });
});
