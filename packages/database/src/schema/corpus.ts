import { COMPLEXITIES, type Complexity, MAX_PASSAGE_LENGTH, TEXT_LANGUAGES, type TextLanguage } from "@incision/domain";
import { sql } from "drizzle-orm";
import { boolean, check, jsonb, pgTable, primaryKey, smallint, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * The coherent-mode corpus (CONF-03, D-21, F-02.3): versions imported whole from
 * `packages/database/corpus/<version>/`, their passages, and what each version says of each
 * passage. A passage is its identity only (Philippe's decision of October 21): its language, typed
 * text, normalisation, exact source text, source and adaptations. Its complexity label, B's
 * measures, the editorial note and the check dates belong to a version, so a re-measure or a
 * re-check is a new version, never a new passage. Nothing here is ever updated or deleted but a
 * version's `active` flag (triggers in the migration); a passage left out of a newer version is
 * retired, not removed, so stored races keep their reference.
 */

export const CORPUS_ENTRY_STATUSES = ["retained", "spare"] as const;
export type CorpusEntryStatus = (typeof CORPUS_ENTRY_STATUSES)[number];
export type CorpusLanguage = TextLanguage;

/** UTF-16 code units in @incision/domain; PostgreSQL counts code points, never more. */
const MAX_LENGTH = sql.raw(String(MAX_PASSAGE_LENGTH));
const SHA256_HEX = sql.raw("'^[0-9a-f]{64}$'");
const inList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

/** One imported corpus version; at most one is active (the one races draw from, F-02.3b). */
export const raceCorpusVersions = pgTable(
  "race_corpus_versions",
  {
    version: text().primaryKey(),
    /** SHA-256 of the version's canonical content: the same version can never come back different. */
    checksum: text().notNull(),
    normalizationVersion: smallint("normalization_version").notNull(),
    /** How B measured M1–M4 for this version (normalisation, wordfreq version, list, Zipf threshold, words). */
    measuredWith: jsonb("measured_with").notNull(),
    /** Set after the import's lock, so later imports carry later times. */
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    active: boolean().notNull().default(false),
  },
  (table) => [
    uniqueIndex("race_corpus_versions_one_active").on(table.active).where(sql`${table.active}`),
    check("race_corpus_versions_version_format", sql`${table.version} ~ '^[0-9a-z][0-9a-z.-]{0,62}$'`),
    check("race_corpus_versions_checksum_format", sql`${table.checksum} ~ ${SHA256_HEX}`),
    check("race_corpus_versions_normalization_known", sql`${table.normalizationVersion} >= 2`),
    check("race_corpus_versions_measured_with_object", sql`jsonb_typeof(${table.measuredWith}) = 'object'`),
  ],
);

/** A passage: what it is and where it comes from (D-21), the same in every version that holds it. */
export const racePassages = pgTable(
  "race_passages",
  {
    /** Stable, language-prefixed (`fr-verne-…`): the id a race records in its configuration. */
    id: text().primaryKey(),
    language: text().$type<TextLanguage>().notNull(),
    text: text().notNull(),
    normalizationVersion: smallint("normalization_version").notNull(),
    sourceText: text("source_text").notNull(),
    adaptations: text().array().notNull(),
    source: jsonb().$type<Readonly<Record<string, unknown>>>().notNull(),
    wordCount: integer("word_count").notNull(),
    /** SHA-256 of the identity above: the same id can never come back different. */
    contentHash: text("content_hash").notNull(),
    /** The version that first brought this passage. */
    firstVersion: text("first_version")
      .notNull()
      .references(() => raceCorpusVersions.version, { onDelete: "restrict" }),
  },
  (table) => [
    check("race_passages_language_known", sql`${table.language} in (${inList(TEXT_LANGUAGES)})`),
    check("race_passages_id_format", sql`${table.id} ~ '^(fr|en)-[0-9a-z]+(-[0-9a-z]+)*$' and char_length(${table.id}) <= 120`),
    check("race_passages_id_language", sql`left(${table.id}, 3) = ${table.language} || '-'`),
    check("race_passages_text_length", sql`char_length(${table.text}) between 1 and ${MAX_LENGTH}`),
    check("race_passages_source_text_not_empty", sql`char_length(${table.sourceText}) > 0`),
    check("race_passages_normalization_known", sql`${table.normalizationVersion} >= 2`),
    check("race_passages_word_count_range", sql`${table.wordCount} >= 10`),
    check(
      "race_passages_source_complete",
      sql`jsonb_typeof(${table.source}) = 'object' and ${table.source} ?& array['author', 'work', 'place', 'edition', 'url', 'revision', 'licence']`,
    ),
    check("race_passages_content_hash_format", sql`${table.contentHash} ~ ${SHA256_HEX}`),
  ],
);

/**
 * What a version says of a passage: retained (drawn) or spare, its editorial complexity label,
 * B's measures, the editorial note and the check dates.
 */
export const raceCorpusEntries = pgTable(
  "race_corpus_entries",
  {
    version: text()
      .notNull()
      .references(() => raceCorpusVersions.version, { onDelete: "restrict" }),
    passageId: text("passage_id")
      .notNull()
      .references(() => racePassages.id, { onDelete: "restrict" }),
    status: text().$type<CorpusEntryStatus>().notNull(),
    /** Editorial label (D-21), not derived from the measures. */
    complexity: text().$type<Complexity>().notNull(),
    /** M1–M4 as provided by B with the corpus, never recomputed here. */
    measures: jsonb().notNull(),
    editorial: jsonb().notNull(),
    checks: jsonb().notNull(),
  },
  (table) => [
    primaryKey({ name: "race_corpus_entries_pkey", columns: [table.version, table.passageId] }),
    check("race_corpus_entries_status_known", sql`${table.status} in (${inList(CORPUS_ENTRY_STATUSES)})`),
    check("race_corpus_entries_complexity_known", sql`${table.complexity} in (${inList(COMPLEXITIES)})`),
    check("race_corpus_entries_measures_complete", sql`jsonb_typeof(${table.measures}) = 'object' and ${table.measures} ?& array['m1', 'm2', 'm3', 'm4']`),
    check("race_corpus_entries_editorial_object", sql`jsonb_typeof(${table.editorial}) = 'object'`),
    check("race_corpus_entries_checks_object", sql`jsonb_typeof(${table.checks}) = 'object'`),
  ],
);
