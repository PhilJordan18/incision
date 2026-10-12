/**
 * Proves that the word data never reach the browser (F-02.4, condition agreed with track A).
 *
 * Every data source is a template literal that opens with WORD_LISTS_SENTINEL
 * (`packages/domain/src/words/data/format.ts`), so a bundler cannot keep the words and drop it.
 * Fingerprints add a second signal that does not depend on the sentinel: a few rare words of the
 * lists. The check fails when a client asset (`apps/web/.next/static/**`) holds the sentinel or a
 * fingerprint, and it never passes vacuously: no client JavaScript chunk, a missing data file, a
 * data file without a sentinel-headed literal, or a fingerprint absent from every such literal all
 * fail explicitly. Only the literals count, so a comment naming a word proves nothing.
 *
 * It covers client assets. The lists are never passed as props to client components, so they
 * never ride in an RSC payload, which no build output can show for dynamic pages.
 *
 * Usage: npm run bundle-check -w @incision/word-lists -- <client-static-dir> <data-file>... [--fingerprint <word>]...
 * Relative paths are resolved from the directory npm was run in.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/** Same value as WORD_DATA_SENTINEL in the engine; a test keeps them in step. */
export const WORD_LISTS_SENTINEL = "incision-word-lists-data-v1";

export type BundleCheck = {
  readonly clientDirFound: boolean;
  readonly scannedClientFiles: number;
  readonly scannedClientChunks: number;
  readonly clientHits: readonly string[];
  readonly fingerprintHits: readonly { readonly file: string; readonly fingerprint: string }[];
  readonly missingDataFiles: readonly string[];
  readonly dataWithoutSentinel: readonly string[];
  readonly fingerprintsNotInData: readonly string[];
};

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();

/** The contents of every template literal that opens with the sentinel. */
export function sentinelLiterals(source: string, sentinel = WORD_LISTS_SENTINEL): string[] {
  const literals: string[] = [];
  for (let start = source.indexOf(`\`${sentinel}`); start !== -1; start = source.indexOf(`\`${sentinel}`, start + 1)) {
    const end = source.indexOf("`", start + 1);
    literals.push(source.slice(start + 1, end === -1 ? undefined : end));
  }
  return literals;
}

export function checkBundle(
  clientStaticDir: string,
  dataFiles: readonly string[],
  options: { readonly sentinel?: string; readonly fingerprints?: readonly string[] } = {},
): BundleCheck {
  const sentinel = options.sentinel ?? WORD_LISTS_SENTINEL;
  const fingerprints = options.fingerprints ?? [];
  const clientDirFound = existsSync(clientStaticDir) && statSync(clientStaticDir).isDirectory();
  const clientFiles = clientDirFound
    ? readdirSync(clientStaticDir, { recursive: true, encoding: "utf8" })
        .map((name) => join(clientStaticDir, name))
        .filter(isFile)
        .map((file) => ({ file, content: readFileSync(file, "utf8") }))
    : [];
  const data = dataFiles.filter(isFile).map((file) => ({ file, literals: sentinelLiterals(readFileSync(file, "utf8"), sentinel) }));
  return {
    clientDirFound,
    scannedClientFiles: clientFiles.length,
    scannedClientChunks: clientFiles.filter(({ file }) => file.endsWith(".js") && file.includes(`${sep}chunks${sep}`)).length,
    clientHits: clientFiles.filter(({ content }) => content.includes(sentinel)).map(({ file }) => file),
    fingerprintHits: clientFiles.flatMap(({ file, content }) => fingerprints.filter((fingerprint) => content.includes(fingerprint)).map((fingerprint) => ({ file, fingerprint }))),
    missingDataFiles: dataFiles.filter((file) => !isFile(file)),
    dataWithoutSentinel: data.filter(({ literals }) => literals.length === 0).map(({ file }) => file),
    fingerprintsNotInData: fingerprints.filter((fingerprint) => !data.some(({ literals }) => literals.some((literal) => literal.includes(fingerprint)))),
  };
}

/** Every reason the check fails; empty when it passes. */
export function bundleCheckFailures(result: BundleCheck): readonly string[] {
  return [
    ...(result.clientDirFound ? [] : ["client static directory not found: build the app first"]),
    ...(result.clientDirFound && result.scannedClientChunks === 0 ? ["no client JavaScript chunk scanned: build the app first, or check the path"] : []),
    ...result.clientHits.map((file) => `word data (sentinel) in a client asset: ${file}`),
    ...result.fingerprintHits.map(({ file, fingerprint }) => `word data (fingerprint "${fingerprint}") in a client asset: ${file}`),
    ...result.missingDataFiles.map((file) => `data file not found, or not a file: ${file}`),
    ...result.dataWithoutSentinel.map((file) => `no sentinel-headed literal in a data file, so the check would pass vacuously: ${file}`),
    ...result.fingerprintsNotInData.map((fingerprint) => `fingerprint "${fingerprint}" is in no data literal, so it proves nothing`),
  ];
}

export type BundleCheckArguments = { readonly clientStaticDir: string; readonly dataFiles: readonly string[]; readonly fingerprints: readonly string[] };

/** Splits the command line into the client directory, the data files and the fingerprints, paths resolved from `base`. */
export function parseArguments(args: readonly string[], base: string): BundleCheckArguments | undefined {
  const positional: string[] = [];
  const fingerprints: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--fingerprint") {
      const value = args[index + 1];
      if (value === undefined || value === "") return undefined;
      fingerprints.push(value);
      index += 1;
    } else {
      positional.push(resolve(base, arg));
    }
  }
  const [clientStaticDir, ...dataFiles] = positional;
  return clientStaticDir === undefined || dataFiles.length === 0 ? undefined : { clientStaticDir, dataFiles, fingerprints };
}

if (process.argv[1]?.endsWith("bundle-check.ts")) {
  // npm run -w runs in tools/word-lists; INIT_CWD is where npm was invoked.
  const parsed = parseArguments(process.argv.slice(2), process.env.INIT_CWD ?? process.cwd());
  if (parsed === undefined) {
    console.error("Usage: npm run bundle-check -w @incision/word-lists -- <client-static-dir> <data-file>... [--fingerprint <word>]...");
    process.exit(2);
  }
  const result = checkBundle(parsed.clientStaticDir, parsed.dataFiles, { fingerprints: parsed.fingerprints });
  const failures = bundleCheckFailures(result);
  for (const failure of failures) {
    console.error(failure);
  }
  if (failures.length === 0) {
    console.log(`bundle check passed: ${result.scannedClientFiles} client assets (${result.scannedClientChunks} JavaScript chunks), ${parsed.dataFiles.length} data files, ${parsed.fingerprints.length} fingerprints`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}
