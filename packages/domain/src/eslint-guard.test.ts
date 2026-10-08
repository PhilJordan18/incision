import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import config from "../eslint.config";

/** Rule ids raised by the package's own ESLint configuration on a sample source file. */
function violations(source: string): string[] {
  const messages = new Linter({ configType: "flat" }).verify(source, config, { filename: "src/sample.ts" });
  return messages.map((message) => message.ruleId ?? `fatal: ${message.message}`);
}

describe("engine purity guard", () => {
  it.each([
    ["reading the clock", "export const now = Date.now();", "no-restricted-properties"],
    ["an argument-less new Date()", "export const now = new Date();", "no-restricted-syntax"],
    ["drawing at random", "export const draw = Math.random();", "no-restricted-properties"],
    ["a random UUID", "export const id = crypto.randomUUID();", "no-restricted-properties"],
    ["a monotonic clock", "export const now = performance.now();", "no-restricted-properties"],
    ["a timer", "setTimeout(() => undefined, 1);", "no-restricted-globals"],
    ["the process", "export const env = process.env;", "no-restricted-globals"],
    ["the network", "export const response = fetch('https://example.com');", "no-restricted-globals"],
    ["a Node module", "import { readFileSync } from 'node:fs';\nexport { readFileSync };", "no-restricted-imports"],
    ["the database package", "import * as database from '@incision/database';\nexport { database };", "no-restricted-imports"],
    ["the application", "import * as web from '../../apps/web/src/server/config';\nexport { web };", "no-restricted-imports"],
  ])("refuses %s", (_label, source, ruleId) => {
    expect(violations(source)).toContain(ruleId);
  });

  it("accepts a date built from a given instant, and pure code", () => {
    expect(violations("export const at = (instant: number) => new Date(instant).toISOString();")).toEqual([]);
  });
});
