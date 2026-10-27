import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { TEXT_LANGUAGES } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { CORPUS_FOLDER } from "./files";
import { DELIVERY_PASSAGE_IDS } from "./import";

/**
 * Philippe's decision 3 of October 21: the corpus files are import input only. Nothing in the
 * application imports them, and the normal release archive leaves them out. These are tripwires;
 * the proof on a real build and a real archive is `npm run db:check-corpus-leak` (DEPLOYMENT.md).
 */
const PACKAGE = path.join(import.meta.dirname, "..", "..");
const ROOT = path.join(PACKAGE, "..", "..");
const CONTRACT = path.join(PACKAGE, "test", "fixtures", "corpus-contract", "contract-2026-10-21");

/** The web application's own sources: its `src`, its server and its Next configuration. */
function webSources(): string[] {
  const web = path.join(ROOT, "apps", "web");
  return [
    ...readdirSync(path.join(web, "src"), { recursive: true, encoding: "utf8" }).map((file) => path.join(web, "src", file)),
    path.join(web, "server.ts"),
    path.join(web, "next.config.ts"),
  ].filter((file) => /\.(ts|tsx)$/.test(file));
}

const contractPassages = () =>
  TEXT_LANGUAGES.flatMap((language) => (JSON.parse(readFileSync(path.join(CONTRACT, `${language}.json`), "utf8")) as { passages: { id: string; text: string }[] }).passages);

describe("where the corpus files live", () => {
  it("outside every folder the release archive copies from a package", () => {
    const script = readFileSync(path.join(ROOT, "scripts", "package-release.sh"), "utf8");
    const copied = script.match(/for folder in ([a-z ]+); do/)?.[1]?.split(" ");
    expect(copied, "scripts/package-release.sh changed: check the archive with db:check-corpus-leak --archive").toEqual(["src", "drizzle", "scripts"]);
    expect(path.relative(PACKAGE, CORPUS_FOLDER)).toBe("corpus");
    // Neither the corpus nor the test fixtures are copied.
    expect(copied).not.toContain("corpus");
    expect(copied).not.toContain("test");
  });

  it("never imported by the web application, nor exported by the package", () => {
    const sources = webSources();
    expect(sources.length).toBeGreaterThan(10);
    const importers = sources.filter((file) => /@incision\/database\/corpus|database\/(src\/)?corpus\b/.test(readFileSync(file, "utf8")));
    expect(importers).toEqual([]);
    const manifest = JSON.parse(readFileSync(path.join(PACKAGE, "package.json"), "utf8")) as { exports: Record<string, string> };
    expect(Object.entries(manifest.exports).filter(([name, target]) => name.includes("corpus") || target.includes("corpus") || name.includes("*"))).toEqual([]);
  });
});

describe("the delivery passages", () => {
  it("are the two passages F-04.0 shipped, whose identity the contract fixture keeps", () => {
    expect(contractPassages().map((passage) => passage.id).toSorted()).toEqual([...DELIVERY_PASSAGE_IDS].toSorted());
  });

  it("are in no source of the web application: since F-02.3b every race text comes from the database", () => {
    // Three pieces of each typed text, at its start, middle and end, as the leak check looks for them.
    const pieces = contractPassages().flatMap(({ text }) => [0, 0.5, 0.8].map((at) => text.slice(Math.floor(text.length * at), Math.floor(text.length * at) + 40)));
    expect(pieces.every((piece) => piece.length === 40)).toBe(true);
    expect(webSources().filter((file) => pieces.some((piece) => readFileSync(file, "utf8").includes(piece)))).toEqual([]);
  });
});
