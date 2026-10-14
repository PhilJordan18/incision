import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";
import { WORD_LISTS_SENTINEL } from "../src/bundle-check";

/**
 * Static half of the server-only boundary: the word data and their sentinel live only under the
 * engine's `src/words/data/`, which no other engine file imports, by any path. The `./words`
 * subpath is their only door; the bundle check covers what a bundler actually ships.
 */
const ENGINE_SRC = join(import.meta.dirname, "..", "..", "..", "packages", "domain", "src");
const DATA_DIR = "words/data";

/** The specifiers of a file's static imports and re-exports. */
const specifiers = (content: string): string[] => [...content.matchAll(/(?:\bfrom|^\s*import)\s*["']([^"']+)["']/gm)].map((match) => match[1] ?? "");

/** The imports by which a file outside the data folder reaches the data; `path` is relative to src. */
export function dataImports(path: string, content: string): string[] {
  if (path.startsWith(`${DATA_DIR}/`)) return [];
  return specifiers(content).filter((specifier) => {
    if (specifier === "@incision/domain/words" || specifier.startsWith("@incision/domain/words/")) return true;
    if (!specifier.startsWith(".")) return false;
    // Resolved against an absolute engine root, so "../../src/words/data" lands where it points.
    const target = posix.resolve("/engine/src", posix.dirname(path), specifier);
    return target === `/engine/src/${DATA_DIR}` || target.startsWith(`/engine/src/${DATA_DIR}/`);
  });
}

const files = readdirSync(ENGINE_SRC, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".ts"))
  .map((path) => ({ path: path.split("\\").join("/"), content: readFileSync(join(ENGINE_SRC, path), "utf8") }));

describe("the engine's word-data boundary", () => {
  it("uses the same sentinel as this tool", () => {
    const format = files.find((file) => file.path === `${DATA_DIR}/format.ts`);
    expect(format?.content).toContain(`export const WORD_DATA_SENTINEL = "${WORD_LISTS_SENTINEL}";`);
  });

  it("writes the sentinel only under src/words/data/", () => {
    const holders = files.filter((file) => file.content.includes(WORD_LISTS_SENTINEL)).map((file) => file.path);
    expect(holders.length).toBeGreaterThan(0);
    expect(holders.filter((path) => !path.startsWith(`${DATA_DIR}/`))).toEqual([]);
  });

  it("lets no engine file outside src/words/data/ import it, by any path", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.flatMap((file) => dataImports(file.path, file.content).map((specifier) => `${file.path}: ${specifier}`))).toEqual([]);
  });

  it("serves the data on the ./words subpath only", () => {
    const manifest = JSON.parse(readFileSync(join(ENGINE_SRC, "..", "package.json"), "utf8")) as { exports: Record<string, string> };
    expect(manifest.exports).toEqual({ ".": "./src/index.ts", "./words": "./src/words/data/index.ts" });
  });
});

describe("dataImports", () => {
  it.each([
    ["words/pool.ts", 'import { WORD_LISTS } from "./data";'],
    ["words/pool.ts", 'import { FR_WORDS } from "./data/fr";'],
    ["words/generate/text.ts", 'import { WORD_LISTS } from "../data/index";'],
    ["index.ts", 'export * from "./words/data";'],
    ["random/prng.ts", 'export { EXCLUSIONS } from "../words/data/index";'],
    ["race/create.ts", "import { WORD_LISTS } from '@incision/domain/words';"],
    ["words/pool.ts", 'import "./data/fr";'],
    ["words/pool.ts", 'import { WORD_LISTS } from "../../src/words/data";'],
  ])("catches %s importing the data: %s", (path, content) => {
    expect(dataImports(path, content)).toHaveLength(1);
  });

  it.each([
    ["words/pool.ts", 'import type { WordList } from "./types";'],
    ["words/data/index.ts", 'import { FR_WORDS } from "./fr";'],
    ["words/data/data.test.ts", 'import * as words from "./index";'],
    ["index.ts", 'export * from "./words/pool";'],
    ["words/pool.ts", 'import { x } from "./database";'],
    ["words/pool.ts", 'import { x } from "../../lib/words/data";'],
  ])("lets %s import %s", (path, content) => {
    expect(dataImports(path, content)).toEqual([]);
  });
});
