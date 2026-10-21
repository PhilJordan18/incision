import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { CORPUS_FOLDER } from "../src/corpus/files";

// Usage: npm run db:check-corpus-leak -w @incision/database -- [--static <folder>] [--archive <zip>]
// Philippe's decision 3 of October 21: the corpus is import input only. Fails when a passage of
// the corpus (or of the contract fixture) appears in the client assets of a build (default
// apps/web/.next/static), or when a release archive holds the corpus or test files. Run after
// `npm run build`, and on an archive made by scripts/package-release.sh. Local check, not in CI.
const PACKAGE = path.join(import.meta.dirname, "..");
const ROOT = path.join(PACKAGE, "..", "..");
const FIXTURES = path.join(PACKAGE, "test", "fixtures");
const TEXT_ASSET = /\.(js|mjs|css|html|json|txt|map|rsc)$/;

function filesUnder(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).flatMap((name) => {
    const entry = path.join(folder, name);
    return statSync(entry).isDirectory() ? filesUnder(entry) : [entry];
  });
}

/**
 * Plain-ASCII pieces of each passage (the longest run of letters, spaces, commas and full stops,
 * cut to 40 characters): a bundler may escape accents and quotes, never these.
 */
function fingerprints(): Map<string, string> {
  const pieces = new Map<string, string>();
  for (const file of [...filesUnder(CORPUS_FOLDER), ...filesUnder(FIXTURES)].filter((name) => name.endsWith(".json"))) {
    const content = JSON.parse(readFileSync(file, "utf8")) as { passages?: { id: string; text: string; sourceText: string }[] };
    for (const passage of content.passages ?? []) {
      for (const text of [passage.text, passage.sourceText]) {
        const run = (text.match(/[A-Za-z ,.]+/g) ?? []).reduce((longest, piece) => (piece.trim().length > longest.length ? piece.trim() : longest), "");
        if (run.length >= 24) pieces.set(run.slice(0, 40), passage.id);
      }
    }
  }
  return pieces;
}

function main(): void {
  const { values } = parseArgs({ options: { static: { type: "string" }, archive: { type: "string" } }, strict: true });
  const leaks: string[] = [];
  const pieces = fingerprints();
  if (pieces.size === 0) {
    throw new Error("No passage found to look for: the check would prove nothing");
  }
  const assets = values.static ?? path.join(ROOT, "apps", "web", ".next", "static");
  const files = filesUnder(assets).filter((file) => TEXT_ASSET.test(file));
  if (files.length === 0) {
    throw new Error(`No client asset under ${assets}: build first`);
  }
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const [piece, id] of pieces) {
      if (content.includes(piece)) leaks.push(`${path.relative(ROOT, file)} holds passage ${id}`);
    }
  }
  console.log(`[corpus-leak] ${files.length} client assets checked against ${pieces.size} passage fingerprints`);
  if (values.archive !== undefined) {
    const entries = execFileSync("unzip", ["-Z1", values.archive], { encoding: "utf8" }).split("\n");
    const held = entries.filter((entry) => /(^|\/)(packages|node_modules\/@incision)\/database\/(corpus|test)\//.test(entry));
    leaks.push(...held.map((entry) => `archive holds ${entry}`));
    console.log(`[corpus-leak] ${entries.length} archive entries checked`);
  }
  if (leaks.length > 0) {
    console.error(leaks.join("\n"));
    process.exit(1);
  }
  console.log("[corpus-leak] no corpus in the client assets" + (values.archive === undefined ? "" : " nor in the archive"));
}

main();
