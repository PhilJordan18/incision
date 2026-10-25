import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import { type CorpusLanguage, raceCorpusEntries, raceCorpusVersions, racePassages } from "../schema/corpus";
import { boundedTransaction, READ_COMMITTED, type ServerLimits, type Transaction } from "../transaction";
import type { CheckedCorpus } from "./check";
import { PASSAGE_ID_PATTERN } from "./format";

/**
 * The passages F-04.0 shipped (`apps/web/src/server/races/race-texts.ts`), which stored races
 * name: every version must bring them until they are stored (F-02.3a criterion).
 */
export const DELIVERY_PASSAGE_IDS = ["fr-verne-vingt-mille-lieues-p1-ch14-pacifique", "en-stevenson-treasure-island-ch07-map"] as const;

/** Advisory lock held by every corpus import for its transaction: imports run one at a time. */
export const CORPUS_IMPORT_LOCK_KEY = 1_646_910_404;

/**
 * An import is an operator's batch, not an application request: it may wait longer than the
 * application's `SERVER_LIMITS_MS` for the lock (another import) and for its statements.
 */
const IMPORT_LIMITS_MS: ServerLimits = { lock: 10_000, statement: 15_000, idleInTransaction: 20_000 };

export type CorpusImportReport = {
  /** `unchanged`: this version was already imported with the same content; nothing was written. */
  readonly outcome: "imported" | "unchanged";
  readonly version: string;
  /** Whether this version is the active one now; re-importing an older version never reactivates it. */
  readonly active: boolean;
  readonly retained: Readonly<Record<CorpusLanguage, number>>;
  readonly spare: Readonly<Record<CorpusLanguage, number>>;
  readonly compatibleWithDefaults: Readonly<Record<CorpusLanguage, number>>;
  /** Passages this version brought for the first time, and those already stored with the same identity. */
  readonly newPassages: number;
  readonly keptPassages: number;
  /** Retained by the version active before, not retained by this one: no longer drawn, never deleted. */
  readonly retiredPassages: number;
};

export type CorpusImportRefusal = {
  readonly code: "VERSION_CONFLICT" | "PASSAGE_CONFLICT" | "REQUIRED_PASSAGE_MISSING" | "STORED_RACE_TEXT_MISMATCH";
  readonly passageId?: string;
  readonly detail: string;
};

export type CorpusImportResult = { readonly ok: true; readonly report: CorpusImportReport } | { readonly ok: false; readonly refusal: CorpusImportRefusal };

function counts(corpus: CheckedCorpus, status: "retained" | "spare"): Record<CorpusLanguage, number> {
  const count = (language: CorpusLanguage) => corpus.passages.filter((passage) => passage.language === language && passage.status === status).length;
  return { fr: count("fr"), en: count("en") };
}

/**
 * Imports a checked corpus version and makes it the active one, in a single READ COMMITTED
 * transaction: the version, its passages, what it says of them and the activation are written
 * together or not at all, so a refusal or a failure leaves the version active before. Imports are
 * serialised by an advisory lock taken before any read. The same version with the same content is
 * a no-op; a version or a passage id already stored with other content is refused, never updated
 * (the tables are append-only). A passage a stored race names must stay known.
 */
export async function importCorpus(db: Database, corpus: CheckedCorpus): Promise<CorpusImportResult> {
  return boundedTransaction(
    db,
    async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${CORPUS_IMPORT_LOCK_KEY})`);
      return importLocked(tx, corpus);
    },
    READ_COMMITTED,
    IMPORT_LIMITS_MS,
  );
}

async function importLocked(tx: Transaction, corpus: CheckedCorpus): Promise<CorpusImportResult> {
  const report = {
    version: corpus.version,
    retained: counts(corpus, "retained"),
    spare: counts(corpus, "spare"),
    compatibleWithDefaults: corpus.compatibleWithDefaults,
  };
  const [existing] = await tx
    .select({ checksum: raceCorpusVersions.checksum, active: raceCorpusVersions.active })
    .from(raceCorpusVersions)
    .where(eq(raceCorpusVersions.version, corpus.version));
  if (existing !== undefined) {
    if (existing.checksum !== corpus.checksum) {
      return { ok: false, refusal: { code: "VERSION_CONFLICT", detail: `version ${corpus.version} is already stored with other content` } };
    }
    return { ok: true, report: { ...report, outcome: "unchanged", active: existing.active, newPassages: 0, keptPassages: corpus.passages.length, retiredPassages: 0 } };
  }

  const ids = corpus.passages.map((passage) => passage.id);
  const stored = new Map(
    (await tx.select({ id: racePassages.id, contentHash: racePassages.contentHash }).from(racePassages).where(inArray(racePassages.id, ids))).map((row) => [
      row.id,
      row.contentHash,
    ]),
  );
  for (const passage of corpus.passages) {
    const hash = stored.get(passage.id);
    if (hash !== undefined && hash !== passage.contentHash) {
      return { ok: false, refusal: { code: "PASSAGE_CONFLICT", passageId: passage.id, detail: `passage ${passage.id} is already stored with another text or source` } };
    }
  }

  // The delivery passages, and every passage a stored race names (`config_snapshot.text`, chosen by
  // the server), must be in this version or already stored, so no race ever names an unknown
  // passage. A race reads under READ COMMITTED: one committed meanwhile is caught by the next import.
  const named = await tx.execute<{ id: string }>(sql`select distinct config_snapshot->>'text' as id from races where config_snapshot ? 'text'`);
  const known = new Set(ids);
  const required = [...new Set([...DELIVERY_PASSAGE_IDS, ...named.rows.map((row) => row.id).filter((id) => PASSAGE_ID_PATTERN.test(id))])].filter((id) => !known.has(id));
  if (required.length > 0) {
    const storedBefore = new Set((await tx.select({ id: racePassages.id }).from(racePassages).where(inArray(racePassages.id, required))).map((row) => row.id));
    const [unknown] = required.filter((id) => !storedBefore.has(id)).sort();
    if (unknown !== undefined) {
      return { ok: false, refusal: { code: "REQUIRED_PASSAGE_MISSING", passageId: unknown, detail: `passage ${unknown} is named by stored races or shipped with F-04.0, and this version does not bring it` } };
    }
  }
  // A passage brought for the first time that stored races already name must be the text they
  // typed (F-04.0 typed the whole passage); later races only name stored passages.
  const fresh = corpus.passages.filter((passage) => !stored.has(passage.id));
  const typed =
    fresh.length === 0
      ? []
      : (
          await tx.execute<{ id: string; text: string }>(
            sql`select distinct config_snapshot->>'text' as id, text_snapshot as text from races
              where config_snapshot->>'text' in (${sql.join(
                fresh.map((passage) => sql`${passage.id}`),
                sql`, `,
              )})`,
          )
        ).rows;
  const mismatch = typed.find((row) => fresh.find((passage) => passage.id === row.id)?.text !== row.text);
  if (mismatch !== undefined) {
    return { ok: false, refusal: { code: "STORED_RACE_TEXT_MISMATCH", passageId: mismatch.id, detail: `stored races typed another text under passage ${mismatch.id}` } };
  }

  const retainedBefore = await tx
    .select({ id: raceCorpusEntries.passageId })
    .from(raceCorpusEntries)
    .innerJoin(raceCorpusVersions, eq(raceCorpusVersions.version, raceCorpusEntries.version))
    .where(and(eq(raceCorpusVersions.active, true), eq(raceCorpusEntries.status, "retained")));
  const retainedNow = new Set(corpus.passages.filter((passage) => passage.status === "retained").map((passage) => passage.id));

  await tx.insert(raceCorpusVersions).values({
    version: corpus.version,
    checksum: corpus.checksum,
    normalizationVersion: corpus.normalizationVersion,
    measuredWith: corpus.measuredWith,
  });
  if (fresh.length > 0) {
    await tx.insert(racePassages).values(
      fresh.map((passage) => ({
        id: passage.id,
        language: passage.language,
        text: passage.text,
        normalizationVersion: passage.identity.normalizationVersion,
        sourceText: passage.sourceText,
        adaptations: passage.adaptations,
        source: passage.source,
        wordCount: passage.wordCount,
        contentHash: passage.contentHash,
        firstVersion: corpus.version,
      })),
    );
  }
  await tx.insert(raceCorpusEntries).values(
    corpus.passages.map((passage) => ({
      version: corpus.version,
      passageId: passage.id,
      status: passage.status,
      complexity: passage.complexity,
      measures: passage.measures,
      editorial: passage.editorial,
      checks: passage.checks,
    })),
  );
  // One active version at a time (unique partial index): the previous one first.
  await tx.update(raceCorpusVersions).set({ active: false }).where(and(eq(raceCorpusVersions.active, true), ne(raceCorpusVersions.version, corpus.version)));
  await tx.update(raceCorpusVersions).set({ active: true }).where(eq(raceCorpusVersions.version, corpus.version));

  return {
    ok: true,
    report: {
      ...report,
      outcome: "imported",
      active: true,
      newPassages: fresh.length,
      keptPassages: corpus.passages.length - fresh.length,
      retiredPassages: retainedBefore.filter((row) => !retainedNow.has(row.id)).length,
    },
  };
}
