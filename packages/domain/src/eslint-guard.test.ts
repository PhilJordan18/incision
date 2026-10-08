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
    ["the database by a relative path", "import * as db from '../../../database/src/client';\nexport { db };", "no-restricted-imports"],
    ["a bare Node module", "import { randomInt } from 'crypto';\nexport { randomInt };", "no-restricted-imports"],
    ["a dynamic import", "export const load = () => import('pg');", "no-restricted-syntax"],
    ["the clock through globalThis", "export const now = globalThis.Date.now();", "no-restricted-globals"],
    ["a Date through globalThis", "export const now = new globalThis.Date();", "no-restricted-globals"],
    ["a Node subpath", "import { setTimeout } from 'timers/promises';\nexport { setTimeout };", "no-restricted-imports"],
    ["Math under another name", "const M = Math;\nexport const draw = M.random();", "no-restricted-syntax"],
    ["Date reassigned", "let D: DateConstructor;\nD = Date;\nexport const now = new D();", "no-restricted-syntax"],
    ["the performance global itself", "export const clock = performance;", "no-restricted-globals"],
  ])("refuses %s", (_label, source, ruleId) => {
    expect(violations(source)).toContain(ruleId);
  });

  it.each([
    ["a date built from a given instant", "export const at = (instant: number) => new Date(instant).toISOString();"],
    ["the package's own files named like Node modules", "import { a } from './events';\nimport { b } from '../text/path';\nexport { a, b };"],
    ["a local folder named database", "import { c } from '../rooms/database';\nexport { c };"],
    ["properties named global", "export const flags = { global: true };\nexport const isGlobal = (re: RegExp) => re.global;"],
    ["Math functions", "export const clamp = (value: number) => Math.min(Math.max(value, 0), 1);"],
  ])("accepts %s", (_label, source) => {
    expect(violations(source)).toEqual([]);
  });
});
