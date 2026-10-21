import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CORPUS_FOLDER } from "./files";

/**
 * Philippe's decision 3 of October 21: the corpus files are import input only. Nothing in the
 * application imports them, and the normal release archive leaves them out. (Their absence from
 * the client assets of a build is checked by `scripts/check-corpus-leak.ts`.)
 */
const PACKAGE = path.join(import.meta.dirname, "..", "..");
const ROOT = path.join(PACKAGE, "..", "..");

function filesUnder(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).flatMap((name) => {
    const entry = path.join(folder, name);
    return statSync(entry).isDirectory() ? filesUnder(entry) : [entry];
  });
}

describe("where the corpus files live", () => {
  it("outside every folder the release archive copies from a package", () => {
    const script = readFileSync(path.join(ROOT, "scripts", "package-release.sh"), "utf8");
    const copied = script.match(/for folder in ([a-z ]+); do/)?.[1]?.split(" ");
    expect(copied).toEqual(["src", "drizzle", "scripts"]);
    expect(path.relative(PACKAGE, CORPUS_FOLDER)).toBe("corpus");
    expect(copied).not.toContain(path.relative(PACKAGE, CORPUS_FOLDER).split(path.sep)[0]);
    // The test fixtures are not copied either.
    expect(copied).not.toContain("test");
  });

  it("never imported by the web application, nor exported as files by the package", () => {
    const web = [...filesUnder(path.join(ROOT, "apps", "web", "src")), path.join(ROOT, "apps", "web", "server.ts")].filter((file) => /\.(ts|tsx)$/.test(file));
    expect(web.length).toBeGreaterThan(0);
    const importers = web.filter((file) => /@incision\/database\/corpus|database\/corpus\//.test(readFileSync(file, "utf8")));
    expect(importers).toEqual([]);
    const manifest = JSON.parse(readFileSync(path.join(PACKAGE, "package.json"), "utf8")) as { exports: Record<string, string> };
    expect(Object.values(manifest.exports).filter((target) => target.startsWith("./corpus/"))).toEqual([]);
  });
});
