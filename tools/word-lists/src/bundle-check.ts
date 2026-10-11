/**
 * Proves that the word data never reach the browser (F-02.4, condition agreed with track A).
 *
 * Every data source opens with WORD_LISTS_SENTINEL inside the same string literal as its words
 * (`packages/domain/src/words/data/format.ts`), so a bundler cannot keep the words and drop it.
 * Fingerprints add a second signal that does not depend on the sentinel: a few rare words of the
 * lists. The check fails when a client asset (`apps/web/.next/static/**`) holds the sentinel or a
 * fingerprint, and it never passes vacuously: no client asset, a missing data file, a data file
 * without the sentinel, or a fingerprint absent from every data file all fail explicitly.
 *
 * Usage: npm run bundle-check -w @incision/word-lists -- <client-static-dir> <data-file>... [--fingerprint <word>]...
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Same value as WORD_DATA_SENTINEL in the engine; a test keeps them in step. */
export const WORD_LISTS_SENTINEL = "incision-word-lists-data-v1";

export type BundleCheck = {
  readonly clientDirFound: boolean;
  readonly scannedClientFiles: number;
  readonly clientHits: readonly string[];
  readonly fingerprintHits: readonly { readonly file: string; readonly fingerprint: string }[];
  readonly missingDataFiles: readonly string[];
  readonly dataWithoutSentinel: readonly string[];
  readonly fingerprintsNotInData: readonly string[];
};

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

export function checkBundle(
  clientStaticDir: string,
  dataFiles: readonly string[],
  options: { readonly sentinel?: string; readonly fingerprints?: readonly string[] } = {},
): BundleCheck {
  const sentinel = options.sentinel ?? WORD_LISTS_SENTINEL;
  const fingerprints = options.fingerprints ?? [];
  const clientDirFound = existsSync(clientStaticDir) && statSync(clientStaticDir).isDirectory();
  const clientFiles = clientDirFound ? filesUnder(clientStaticDir).map((file) => ({ file, content: readFileSync(file, "utf8") })) : [];
  const presentData = dataFiles.filter((file) => existsSync(file)).map((file) => ({ file, content: readFileSync(file, "utf8") }));
  return {
    clientDirFound,
    scannedClientFiles: clientFiles.length,
    clientHits: clientFiles.filter(({ content }) => content.includes(sentinel)).map(({ file }) => file),
    fingerprintHits: clientFiles.flatMap(({ file, content }) => fingerprints.filter((fingerprint) => content.includes(fingerprint)).map((fingerprint) => ({ file, fingerprint }))),
    missingDataFiles: dataFiles.filter((file) => !existsSync(file)),
    dataWithoutSentinel: presentData.filter(({ content }) => !content.includes(sentinel)).map(({ file }) => file),
    fingerprintsNotInData: fingerprints.filter((fingerprint) => !presentData.some(({ content }) => content.includes(fingerprint))),
  };
}

/** Every reason the check fails; empty when it passes. */
export function bundleCheckFailures(result: BundleCheck): readonly string[] {
  return [
    ...(result.clientDirFound ? [] : ["client static directory not found: build the app first"]),
    ...(result.clientDirFound && result.scannedClientFiles === 0 ? ["no client asset scanned: build the app first"] : []),
    ...result.clientHits.map((file) => `word data (sentinel) in a client asset: ${file}`),
    ...result.fingerprintHits.map(({ file, fingerprint }) => `word data (fingerprint "${fingerprint}") in a client asset: ${file}`),
    ...result.missingDataFiles.map((file) => `data file not found: ${file}`),
    ...result.dataWithoutSentinel.map((file) => `sentinel missing from a data file, so the check would pass vacuously: ${file}`),
    ...result.fingerprintsNotInData.map((fingerprint) => `fingerprint "${fingerprint}" is in no data file, so it proves nothing`),
  ];
}

/** Splits the command line into the client directory, the data files and the fingerprints. */
export function parseArguments(args: readonly string[]): { readonly clientStaticDir: string; readonly dataFiles: readonly string[]; readonly fingerprints: readonly string[] } | undefined {
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
      positional.push(arg);
    }
  }
  const [clientStaticDir, ...dataFiles] = positional;
  return clientStaticDir === undefined || dataFiles.length === 0 ? undefined : { clientStaticDir, dataFiles, fingerprints };
}

if (process.argv[1]?.endsWith("bundle-check.ts")) {
  const parsed = parseArguments(process.argv.slice(2));
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
    console.log(`bundle check passed: ${result.scannedClientFiles} client assets, ${parsed.dataFiles.length} data files, ${parsed.fingerprints.length} fingerprints`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}
