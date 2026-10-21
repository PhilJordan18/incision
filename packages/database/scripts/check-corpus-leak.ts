import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { CORPUS_FOLDER } from "../src/corpus/files";
import { corpusFileSchema } from "../src/corpus/format";

// Usage: npm run db:check-corpus-leak -w @incision/database -- [--web <apps/web folder>] [--archive <zip>]
// Philippe's decision 3 of October 21: the corpus is import input only. Fails when a passage of
// the corpus (or of the contract fixture) appears in what a build serves to clients: the client
// assets (.next/static), the prerendered pages (.next/server/app: html, rsc, body, meta) and
// public/. With --archive, also fails when a release archive holds the corpus or test files, or
// a passage in those same client-served parts. Server bundles are not scanned: until F-02.3b the
// two delivery passages are server code by design (race-texts.ts). Local check, not in CI.
const PACKAGE = path.join(import.meta.dirname, "..");
const ROOT = path.join(PACKAGE, "..", "..");
const FIXTURES = path.join(PACKAGE, "test", "fixtures");
const TEXT_FILE = /\.(js|mjs|css|html|json|txt|map|rsc|body|meta|xml|svg)$/;
const SERVED = ["static", path.join("server", "app")];
const PIECES_PER_TEXT = 3;

function filesUnder(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .map((file) => path.join(folder, file))
    .filter((file) => statSync(file).isFile());
}

/**
 * Plain-ASCII pieces of each passage (its longest runs of letters, spaces, commas and full stops,
 * cut to 40 characters): a bundler may escape accents and quotes, never these. A passage without
 * any such run cannot be looked for, and fails the check rather than pass unseen.
 */
function fingerprints(): { pieces: Map<string, string>; unseen: string[] } {
  const pieces = new Map<string, string>();
  const unseen: string[] = [];
  for (const file of [...filesUnder(CORPUS_FOLDER), ...filesUnder(FIXTURES)].filter((name) => name.endsWith(".json"))) {
    const parsed = corpusFileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success) {
      throw new Error(`${path.relative(ROOT, file)} is not a corpus file: fix it, then check again`);
    }
    for (const passage of parsed.data.passages) {
      const runs = [passage.text, passage.sourceText].flatMap((text) => (text.match(/[A-Za-z ,.]+/g) ?? []).map((run) => run.trim()).filter((run) => run.length >= 24));
      runs.sort((a, b) => b.length - a.length);
      if (runs.length === 0) unseen.push(passage.id);
      for (const run of runs.slice(0, PIECES_PER_TEXT)) pieces.set(run.slice(0, 40), passage.id);
    }
  }
  return { pieces, unseen };
}

/** What a build under `web` serves to clients. */
function servedFiles(web: string): string[] {
  return [...SERVED.flatMap((part) => filesUnder(path.join(web, ".next", part))), ...filesUnder(path.join(web, "public"))].filter((file) => TEXT_FILE.test(file));
}

function scan(files: readonly string[], pieces: ReadonlyMap<string, string>, base: string): string[] {
  const leaks: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const [piece, id] of pieces) {
      if (content.includes(piece)) leaks.push(`${path.relative(base, file)} holds passage ${id}`);
    }
  }
  return leaks;
}

function main(): void {
  const { values } = parseArgs({ options: { web: { type: "string" }, archive: { type: "string" } }, strict: true });
  const { pieces, unseen } = fingerprints();
  if (pieces.size === 0) {
    throw new Error("No passage found to look for: the check would prove nothing");
  }
  const leaks = unseen.map((id) => `passage ${id} has no plain-ASCII run long enough to be looked for`);
  const web = values.web ?? path.join(ROOT, "apps", "web");
  const files = servedFiles(web);
  if (files.length === 0) {
    throw new Error(`Nothing served under ${web}/.next: build first`);
  }
  leaks.push(...scan(files, pieces, ROOT));
  console.log(`[corpus-leak] ${files.length} client-served files checked against ${pieces.size} fingerprints`);

  if (values.archive !== undefined) {
    const entries = execFileSync("unzip", ["-Z1", values.archive], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).split("\n");
    leaks.push(...entries.filter((entry) => /(^|\/)(packages|node_modules\/@incision)\/database\/(corpus|test)\//.test(entry)).map((entry) => `archive holds ${entry}`));
    const unpacked = mkdtempSync(path.join(tmpdir(), "incision-archive-"));
    try {
      // Exit 11: no entry matched a pattern (no public/, for example), not an error.
      const result = spawnSync("unzip", ["-q", "-o", values.archive, "apps/web/.next/static/*", "apps/web/.next/server/app/*", "apps/web/public/*", "-d", unpacked], { stdio: "ignore" });
      if (result.status !== 0 && result.status !== 11) {
        throw new Error(`unzip failed (${result.status ?? result.signal})`);
      }
      const served = servedFiles(path.join(unpacked, "apps", "web"));
      leaks.push(...scan(served, pieces, unpacked).map((leak) => `archive: ${leak}`));
      console.log(`[corpus-leak] ${entries.length} archive entries listed, ${served.length} client-served files checked`);
    } finally {
      rmSync(unpacked, { recursive: true, force: true });
    }
  }

  if (leaks.length > 0) {
    console.error(leaks.join("\n"));
    process.exit(1);
  }
  console.log(`[corpus-leak] no corpus in what clients receive${values.archive === undefined ? "" : ", nor in the archive"}`);
}

main();
