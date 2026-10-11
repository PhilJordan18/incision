import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { WORD_LISTS_SENTINEL } from "../src/bundle-check";

/**
 * Static half of the server-only boundary: the word data and their sentinel live only under the
 * engine's `src/words/data/`, which only the `./words` subpath and its own tests reach. The bundle
 * check covers what a bundler actually ships.
 */
const ENGINE_SRC = join(import.meta.dirname, "..", "..", "..", "packages", "domain", "src");
const DATA_DIR = "words/data/";

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sources(path) : name.endsWith(".ts") ? [path] : [];
  });
}

const files = sources(ENGINE_SRC).map((path) => ({ path: relative(ENGINE_SRC, path), content: readFileSync(path, "utf8") }));

describe("the engine's word-data boundary", () => {
  it("uses the same sentinel as this tool", () => {
    const format = files.find((file) => file.path === `${DATA_DIR}format.ts`);
    expect(format?.content).toContain(`export const WORD_DATA_SENTINEL = "${WORD_LISTS_SENTINEL}";`);
  });

  it("writes the sentinel only under src/words/data/", () => {
    const holders = files.filter((file) => file.content.includes(WORD_LISTS_SENTINEL)).map((file) => file.path);
    expect(holders.length).toBeGreaterThan(0);
    expect(holders.filter((path) => !path.startsWith(DATA_DIR))).toEqual([]);
  });

  it("lets nothing outside src/words/data/ import it", () => {
    const importers = files.filter((file) => !file.path.startsWith(DATA_DIR) && /from\s+["'][^"']*words\/data/.test(file.content)).map((file) => file.path);
    expect(importers).toEqual([]);
  });

  it("serves the data on the ./words subpath only", () => {
    const manifest = JSON.parse(readFileSync(join(ENGINE_SRC, "..", "package.json"), "utf8")) as { exports: Record<string, string> };
    expect(manifest.exports).toEqual({ ".": "./src/index.ts", "./words": "./src/words/data/index.ts" });
  });
});
