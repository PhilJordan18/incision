import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { CORPUS_FOLDER } from "../src/corpus/files";
import { corpusFileSchema } from "../src/corpus/format";
import { DELIVERY_PASSAGE_IDS } from "../src/corpus/import";

// Usage: npm run db:check-corpus-leak -w @incision/database -- [--web <apps/web folder>] [--archive <zip>]
// Philippe's decision 3 of October 21: the corpus is import input only. Fails when a passage of
// the corpus (or of the contract fixture) appears anywhere in a build's `.next` (cache aside) or
// in `public/`. With --archive, also fails when a release archive holds the corpus or test files,
// or a passage in its `.next`, its `public/` or the sources it ships (packages/*/src, apps/web/src).
// One exception, until F-02.3b: the two delivery passages may appear in race-texts.ts, the server
// source that runs them today (through tsx, outside the Next build). Local check, not in CI.
const PACKAGE = path.join(import.meta.dirname, "..");
const ROOT = path.join(PACKAGE, "..", "..");
const CONTRACT_FIXTURE = path.join(PACKAGE, "test", "fixtures", "corpus-contract");
const RACE_TEXTS = path.join("apps", "web", "src", "server", "races", "race-texts.ts");
const TEXT_FILE = /\.(js|mjs|cjs|ts|tsx|css|html|json|txt|map|rsc|body|meta|xml|svg)$/;
const PIECES_PER_PASSAGE = 3;
const DELIVERY: ReadonlySet<string> = new Set(DELIVERY_PASSAGE_IDS);

function filesUnder(folder: string, skip?: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((file) => skip === undefined || !file.split(path.sep).includes(skip))
    .map((file) => path.join(folder, file))
    .filter((file) => TEXT_FILE.test(file) && statSync(file).isFile());
}

/**
 * Plain-ASCII pieces of each passage (its longest runs of letters, spaces, commas and full stops,
 * cut to 40 characters): a bundler may escape accents and quotes, never these. A passage without
 * any such run cannot be looked for, and fails the check rather than pass unseen.
 */
function fingerprints(): { pieces: Map<string, string>; unseen: string[] } {
  const pieces = new Map<string, string>();
  const unseen: string[] = [];
  for (const file of [...filesUnder(CORPUS_FOLDER), ...filesUnder(CONTRACT_FIXTURE)].filter((name) => name.endsWith(".json"))) {
    const parsed = corpusFileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success) {
      throw new Error(`${path.relative(ROOT, file)} is not a corpus file: fix it, then check again`);
    }
    for (const passage of parsed.data.passages) {
      const runs = [passage.text, passage.sourceText].flatMap((text) => (text.match(/[A-Za-z ,.]+/g) ?? []).map((run) => run.trim()).filter((run) => run.length >= 24));
      runs.sort((a, b) => b.length - a.length);
      if (runs.length === 0) unseen.push(passage.id);
      for (const run of runs.slice(0, PIECES_PER_PASSAGE)) pieces.set(run.slice(0, 40), passage.id);
    }
  }
  return { pieces, unseen };
}

/** Leaks in `files` (paths under `base`); `allowed` says where a passage may be. */
function scan(files: readonly string[], pieces: ReadonlyMap<string, string>, base: string, allowed: (file: string, id: string) => boolean = () => false): string[] {
  const leaks: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const [piece, id] of pieces) {
      if (content.includes(piece) && !allowed(path.relative(base, file), id)) leaks.push(`${path.relative(base, file)} holds passage ${id}`);
    }
  }
  return leaks;
}

/** A build's output and what it serves: `.next` without its cache, and `public/`. */
function buildFiles(web: string): string[] {
  return [...filesUnder(path.join(web, ".next"), "cache"), ...filesUnder(path.join(web, "public"))];
}

function main(): void {
  const { values } = parseArgs({ options: { web: { type: "string" }, archive: { type: "string" } }, strict: true });
  const { pieces, unseen } = fingerprints();
  if (pieces.size === 0) {
    throw new Error("No passage found to look for: the check would prove nothing");
  }
  const leaks = unseen.map((id) => `passage ${id} has no plain-ASCII run long enough to be looked for`);
  const web = values.web ?? path.join(ROOT, "apps", "web");
  const built = buildFiles(web);
  if (!existsSync(path.join(web, ".next", "BUILD_ID"))) {
    throw new Error(`No build under ${web}/.next: build first`);
  }
  leaks.push(...scan(built, pieces, ROOT));
  console.log(`[corpus-leak] ${built.length} build files checked against ${pieces.size} fingerprints`);

  if (values.archive !== undefined) {
    const entries = execFileSync("unzip", ["-Z1", values.archive], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).split("\n");
    leaks.push(...entries.filter((entry) => /(^|\/)(packages|node_modules\/@incision)\/database\/(corpus|test)\//.test(entry)).map((entry) => `archive holds ${entry}`));
    const unpacked = mkdtempSync(path.join(tmpdir(), "incision-archive-"));
    try {
      // Exit 11: no entry matched a pattern (no public/, for example), not an error.
      const result = spawnSync("unzip", ["-q", "-o", values.archive, "apps/web/.next/*", "apps/web/public/*", "apps/web/src/*", "packages/*/src/*", "-x", "apps/web/.next/cache/*", "-d", unpacked], {
        stdio: "ignore",
      });
      if (result.status !== 0 && result.status !== 11) {
        throw new Error(`unzip failed (${result.status ?? result.signal})`);
      }
      const shipped = [...buildFiles(path.join(unpacked, "apps", "web")), ...filesUnder(path.join(unpacked, "apps", "web", "src")), ...filesUnder(path.join(unpacked, "packages"))];
      leaks.push(...scan(shipped, pieces, unpacked, (file, id) => file === RACE_TEXTS && DELIVERY.has(id)).map((leak) => `archive: ${leak}`));
      console.log(`[corpus-leak] ${entries.length} archive entries listed, ${shipped.length} shipped files checked`);
    } finally {
      rmSync(unpacked, { recursive: true, force: true });
    }
  }

  if (leaks.length > 0) {
    console.error(leaks.join("\n"));
    process.exit(1);
  }
  console.log(`[corpus-leak] no corpus in the build${values.archive === undefined ? "" : ", nor in the archive"}`);
}

main();
