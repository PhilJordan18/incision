import { checkCorpus, type CheckedCorpus } from "../../../packages/database/src/corpus/check";
import { readCorpusVersion } from "../../../packages/database/src/corpus/files";

// Pin the checked-in input so a later corpus addition cannot silently change this benchmark.
// Local qualification only: the version's editorial/production acceptance remains human.
export const LOAD_CORPUS_VERSION = "2026-10-25.4";

export async function readLoadCorpus(): Promise<CheckedCorpus> {
  const checked = checkCorpus(await readCorpusVersion(LOAD_CORPUS_VERSION));
  if (!checked.ok) throw new Error("Load corpus failed the project's import checks");
  if (checked.corpus.version !== LOAD_CORPUS_VERSION) throw new Error("Load corpus version mismatch");
  return checked.corpus;
}
