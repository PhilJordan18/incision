/**
 * Proves that the word lists never reach the browser (F-02.4, condition agreed with track A).
 *
 * The generated word data carries WORD_LISTS_SENTINEL. The check fails when the sentinel appears in
 * any client asset (`apps/web/.next/static/**`), and also when it is missing from the files where
 * the data legitimately lives, so it can never pass vacuously (for example on an empty build).
 * The sentinel must sit inside the exported data value itself (a field of the data object), never
 * in a separate export: tree shaking could drop an unused separate export and keep the lists.
 *
 * Usage: npm run bundle-check -w @incision/word-lists -- <client-static-dir> <data-file>...
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Embedded in every generated word-data module; never written anywhere else. */
export const WORD_LISTS_SENTINEL = "incision-word-lists-data-v1";

export type BundleCheck = { readonly clientHits: readonly string[]; readonly missingData: readonly string[]; readonly scannedClientFiles: number };

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

export function checkBundle(clientStaticDir: string, dataFiles: readonly string[], sentinel = WORD_LISTS_SENTINEL): BundleCheck {
  const clientFiles = filesUnder(clientStaticDir);
  return {
    clientHits: clientFiles.filter((path) => readFileSync(path).includes(sentinel)),
    missingData: dataFiles.filter((path) => !readFileSync(path).includes(sentinel)),
    scannedClientFiles: clientFiles.length,
  };
}

/** Every reason the check fails; empty when it passes. */
export function bundleCheckFailures(result: BundleCheck): readonly string[] {
  return [
    ...(result.scannedClientFiles === 0 ? ["no client asset scanned: build the app first"] : []),
    ...result.clientHits.map((path) => `word data in a client asset: ${path}`),
    ...result.missingData.map((path) => `sentinel missing from a data file, so the check would pass vacuously: ${path}`),
  ];
}

if (process.argv[1]?.endsWith("bundle-check.ts")) {
  const [clientStaticDir, ...dataFiles] = process.argv.slice(2);
  if (clientStaticDir === undefined || dataFiles.length === 0) {
    console.error("Usage: npm run bundle-check -w @incision/word-lists -- <client-static-dir> <data-file>...");
    process.exit(2);
  }
  const failures = bundleCheckFailures(checkBundle(clientStaticDir, dataFiles));
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}
