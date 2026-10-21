import { checkPassages, type Passage } from "@incision/domain";
import { asc, eq } from "drizzle-orm";
import { raceCorpusEntries, raceCorpusVersions, racePassages } from "../schema/corpus";
import type { Queryable } from "../transaction";
import { type PassageIdentity, passageContentHash, type VersionEntry, versionChecksum } from "./hash";

export type ActiveCorpus = { readonly version: string; readonly passages: readonly Passage[] };

/**
 * The passages races may draw (F-02.3b): the active version's retained passages, frozen and
 * checked by the engine. Undefined while no version is active (none imported yet). The rows are
 * checked against the fingerprints the import wrote: a passage changed or added outside an import
 * makes the load fail rather than serve it.
 */
export async function loadActiveCorpus(db: Queryable): Promise<ActiveCorpus | undefined> {
  const [active] = await db
    .select({
      version: raceCorpusVersions.version,
      checksum: raceCorpusVersions.checksum,
      normalizationVersion: raceCorpusVersions.normalizationVersion,
      measuredWith: raceCorpusVersions.measuredWith,
    })
    .from(raceCorpusVersions)
    .where(eq(raceCorpusVersions.active, true));
  if (active === undefined) {
    return undefined;
  }
  const rows = await db
    .select({ passage: racePassages, entry: raceCorpusEntries })
    .from(raceCorpusEntries)
    .innerJoin(racePassages, eq(racePassages.id, raceCorpusEntries.passageId))
    .where(eq(raceCorpusEntries.version, active.version))
    .orderBy(asc(racePassages.id));

  const entries: VersionEntry[] = [];
  for (const { passage, entry } of rows) {
    const identity: PassageIdentity = {
      id: passage.id,
      language: passage.language,
      text: passage.text,
      normalizationVersion: passage.normalizationVersion,
      sourceText: passage.sourceText,
      adaptations: passage.adaptations,
      source: passage.source,
      wordCount: passage.wordCount,
    };
    if (passageContentHash(identity) !== passage.contentHash) {
      throw new Error(`Corpus passage ${passage.id} no longer matches its fingerprint`);
    }
    entries.push({ identity, status: entry.status, complexity: entry.complexity, measures: entry.measures, editorial: entry.editorial, checks: entry.checks });
  }
  if (versionChecksum(active.version, active.normalizationVersion, active.measuredWith, entries) !== active.checksum) {
    throw new Error(`Corpus version ${active.version} no longer matches its checksum`);
  }

  const passages: readonly Passage[] = Object.freeze(
    rows
      .filter(({ entry }) => entry.status === "retained")
      .map(({ passage, entry }) => Object.freeze({ id: passage.id, language: passage.language, complexity: entry.complexity, text: passage.text })),
  );
  checkPassages(passages);
  return { version: active.version, passages };
}
