import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { TEXT_LANGUAGES, type TextLanguage } from "@incision/domain";
import { CORPUS_VERSION_PATTERN } from "./format";

/**
 * Import input only (Philippe's decision 3 of October 21): `packages/database/corpus/<version>/`.
 * Nothing in the application imports these files, and the release archive leaves them out
 * (`scripts/package-release.sh` copies each package's `src`, `drizzle` and `scripts` only).
 */
export const CORPUS_FOLDER = path.join(import.meta.dirname, "..", "..", "corpus");

/** A corpus file is a few hundred kilobytes; anything far larger is not one. */
export const MAX_CORPUS_FILE_BYTES = 4 * 1024 * 1024;

export class CorpusFileError extends Error {
  constructor(
    readonly code: "FILE_TOO_LARGE" | "INVALID_JSON" | "NOT_CANONICAL_JSON",
    readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
    this.name = "CorpusFileError";
  }
}

/**
 * The files of one corpus version, parsed as JSON, not yet checked (`checkCorpus` does that).
 * Each file must be written exactly as `JSON.stringify(value, null, 2)` followed by a newline:
 * a duplicate key, which `JSON.parse` would silently resolve, then fails, so what a reviewer
 * reads is what the import stores.
 */
export async function readCorpusVersion(version: string, folder: string = CORPUS_FOLDER): Promise<Record<TextLanguage, unknown>> {
  if (!CORPUS_VERSION_PATTERN.test(version)) {
    throw new Error(`Not a corpus version: ${version}`);
  }
  const files = await Promise.all(
    TEXT_LANGUAGES.map(async (language) => {
      const file = path.join(folder, version, `${language}.json`);
      const { size } = await stat(file);
      if (size > MAX_CORPUS_FILE_BYTES) {
        throw new CorpusFileError("FILE_TOO_LARGE", file, `${size} bytes, more than ${MAX_CORPUS_FILE_BYTES}`);
      }
      const raw = await readFile(file, "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new CorpusFileError("INVALID_JSON", file, "not JSON");
      }
      if (`${JSON.stringify(parsed, null, 2)}\n` !== raw) {
        throw new CorpusFileError("NOT_CANONICAL_JSON", file, "a duplicate key, or not written as JSON.stringify(value, null, 2) and a newline");
      }
      return [language, parsed] as const;
    }),
  );
  return Object.fromEntries(files) as Record<TextLanguage, unknown>;
}
