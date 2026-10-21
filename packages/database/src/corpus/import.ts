import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import { type CorpusLanguage, raceCorpusEntries, raceCorpusVersions, racePassages } from "../schema/corpus";
import type { Transaction } from "../transaction";
import type { CheckedCorpus } from "./check";

/** Advisory lock held by every corpus import for its transaction: imports run one at a time. */
export const CORPUS_IMPORT_LOCK_KEY = 1_646_910_404;

/**
 * An import is an operator's batch, not an application request: it may wait longer than the
 * application's `SERVER_LIMITS_MS` for the lock (another import) and for its statements.
 */
const IMPORT_LIMITS_MS = { lock: 10_000, statement: 15_000, idleInTransaction: 20_000 } as const;

export type CorpusImportReport = {
  /** `unchanged`: this version was already imported with the same content; nothing was written. */
  readonly outcome: "imported" | "unchanged";
  readonly version: string;
  readonly active: boolean;
  readonly retained: Readonly<Record<CorpusLanguage, number>>;
  readonly spare: Readonly<Record<CorpusLanguage, number>>;
  readonly compatibleWithDefaults: Readonly<Record<CorpusLanguage, number>>;
  /** Passages this version brought for the first time, and those already stored with the same content. */
  readonly newPassages: number;
  readonly keptPassages: number;
  /** Retained by the version active before, not retained by this one: no longer drawn, never deleted. */
  readonly retiredPassages: number;
};

export type CorpusImportRefusal = {
  readonly code: "VERSION_CONFLICT" | "PASSAGE_CONFLICT";
  readonly passageId?: string;
  readonly detail: string;
};

export type CorpusImportResult = { readonly ok: true; readonly report: CorpusImportReport } | { readonly ok: false; readonly refusal: CorpusImportRefusal };

function counts(corpus: CheckedCorpus, status: "retained" | "spare"): Record<CorpusLanguage, number> {
  const count = (language: CorpusLanguage) => corpus.passages.filter((passage) => passage.language === language && passage.status === status).length;
  return { fr: count("fr"), en: count("en") };
}

/**
 * Imports a checked corpus version and makes it the active one, in a single transaction: the
 * version, its passages, their membership and the activation are written together or not at
 * all, so a refusal or a failure leaves the version active before. Imports are serialised by an
 * advisory lock. The same version with the same content is a no-op; a version or a passage id
 * already stored with other content is refused, never updated (the tables are append-only).
 */
export async function importCorpus(db: Database, corpus: CheckedCorpus): Promise<CorpusImportResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('lock_timeout', ${`${IMPORT_LIMITS_MS.lock}ms`}, true),
        set_config('statement_timeout', ${`${IMPORT_LIMITS_MS.statement}ms`}, true),
        set_config('idle_in_transaction_session_timeout', ${`${IMPORT_LIMITS_MS.idleInTransaction}ms`}, true)`,
    );
    await tx.execute(sql`select pg_advisory_xact_lock(${CORPUS_IMPORT_LOCK_KEY})`);
    return importLocked(tx, corpus);
  });
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
      return { ok: false, refusal: { code: "PASSAGE_CONFLICT", passageId: passage.id, detail: `passage ${passage.id} is already stored with other content` } };
    }
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
  const fresh = corpus.passages.filter((passage) => !stored.has(passage.id));
  if (fresh.length > 0) {
    await tx.insert(racePassages).values(
      fresh.map((passage) => ({
        id: passage.id,
        language: passage.language,
        complexity: passage.complexity,
        text: passage.text,
        normalizationVersion: corpus.normalizationVersion,
        sourceText: passage.sourceText,
        adaptations: passage.adaptations,
        source: passage.source,
        wordCount: passage.wordCount,
        measures: passage.measures,
        editorial: passage.editorial,
        checks: passage.checks,
        contentHash: passage.contentHash,
        firstVersion: corpus.version,
      })),
    );
  }
  await tx.insert(raceCorpusEntries).values(corpus.passages.map((passage) => ({ version: corpus.version, passageId: passage.id, status: passage.status })));
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
