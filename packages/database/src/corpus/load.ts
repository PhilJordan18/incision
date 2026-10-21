import { checkPassages, type Passage } from "@incision/domain";
import { and, asc, eq } from "drizzle-orm";
import type { Queryable } from "../transaction";
import { raceCorpusEntries, raceCorpusVersions, racePassages } from "../schema/corpus";

export type ActiveCorpus = { readonly version: string; readonly passages: readonly Passage[] };

/**
 * The passages races may draw (F-02.3b): the active version's retained passages, frozen and
 * checked by the engine. Undefined while no version is active (none imported yet).
 */
export async function loadActiveCorpus(db: Queryable): Promise<ActiveCorpus | undefined> {
  const [active] = await db.select({ version: raceCorpusVersions.version }).from(raceCorpusVersions).where(eq(raceCorpusVersions.active, true));
  if (active === undefined) {
    return undefined;
  }
  const rows = await db
    .select({ id: racePassages.id, language: racePassages.language, complexity: racePassages.complexity, text: racePassages.text })
    .from(raceCorpusEntries)
    .innerJoin(racePassages, eq(racePassages.id, raceCorpusEntries.passageId))
    .where(and(eq(raceCorpusEntries.version, active.version), eq(raceCorpusEntries.status, "retained")))
    .orderBy(asc(racePassages.id));
  const passages: readonly Passage[] = Object.freeze(rows.map((row) => Object.freeze({ ...row })));
  checkPassages(passages);
  return { version: active.version, passages };
}
