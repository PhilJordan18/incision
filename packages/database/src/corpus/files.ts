import { readFile } from "node:fs/promises";
import path from "node:path";
import { CORPUS_LANGUAGES, type CorpusLanguage } from "../schema/corpus";
import { CORPUS_VERSION_PATTERN } from "./format";

/**
 * Import input only (Philippe's decision 3 of October 21): `packages/database/corpus/<version>/`.
 * Nothing in the application imports these files, and the release archive leaves them out
 * (`scripts/package-release.sh` copies each package's `src`, `drizzle` and `scripts` only).
 */
export const CORPUS_FOLDER = path.join(import.meta.dirname, "..", "..", "corpus");

/** The files of one corpus version, parsed as JSON, not yet checked (`checkCorpus` does that). */
export async function readCorpusVersion(version: string, folder: string = CORPUS_FOLDER): Promise<Record<CorpusLanguage, unknown>> {
  if (!CORPUS_VERSION_PATTERN.test(version)) {
    throw new Error(`Not a corpus version: ${version}`);
  }
  const files = await Promise.all(
    CORPUS_LANGUAGES.map(async (language) => [language, JSON.parse(await readFile(path.join(folder, version, `${language}.json`), "utf8")) as unknown] as const),
  );
  return Object.fromEntries(files) as Record<CorpusLanguage, unknown>;
}
