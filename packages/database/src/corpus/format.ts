import { MAX_PASSAGE_LENGTH, MIN_TEXT_WORDS, NORMALIZATION_VERSION } from "@incision/domain";
import { z } from "zod";
import { CORPUS_COMPLEXITIES, CORPUS_ENTRY_STATUSES, CORPUS_LANGUAGES } from "../schema/corpus";

/**
 * The corpus files, one per language, in `packages/database/corpus/<version>/<language>.json`
 * (F-02.3). B authors them from the registry; the import trusts nothing in them: unknown fields
 * are refused, every bound is checked here or in `checkCorpus`.
 */

const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.iso.date();

export const CORPUS_VERSION_PATTERN = /^[0-9a-z][0-9a-z.-]{0,62}$/;
export const PASSAGE_ID_PATTERN = /^(fr|en)-[0-9a-z]+(-[0-9a-z]+)*$/;
/** The longest exact source text accepted: a passage is typed from at most its first 200 words. */
export const MAX_SOURCE_TEXT_LENGTH = 2 * MAX_PASSAGE_LENGTH;

/**
 * How B measured M1–M4 (`measureText` of @incision/domain over the pinned wordfreq maps): one
 * setting per corpus version, repeated on every passage, which must match it.
 */
const measuredWith = z.strictObject({
  normalizationVersion: z.int().min(1),
  wordfreq: text(40),
  listVersion: text(80),
  commonZipf: z.number().min(0).max(8),
});

/**
 * M1–M4 as provided by B, never recomputed by the import. Bounds: M1 is a mean number of letters
 * per word (above 8 is an anomaly), M2 and M3 are percentages, M4 a count per 100 words.
 * `z.number()` refuses NaN and infinities (JSON can produce an infinity: `1e999`).
 */
const measures = z.strictObject({
  m1: z.number().gt(0).max(8),
  m2: z.number().min(0).max(100),
  m3: z.number().min(0).max(100),
  m4: z.number().min(0).max(100),
  measuredWith,
});

const source = z.strictObject({
  author: text(200),
  work: text(300),
  /** Where in the work: part, chapter, paragraph. */
  place: text(300),
  edition: text(300),
  url: z.url({ protocol: /^https$/ }).max(500),
  /** Wikisource revision id, or Project Gutenberg eBook number. */
  revision: text(100),
  licence: text(500),
  /** When B fetched the source text. */
  retrievedAt: date,
  /** Project Gutenberg's « Most recently updated », when known. */
  fileUpdatedAt: date.optional(),
});

export const corpusPassageSchema = z.strictObject({
  id: z.string().max(120).regex(PASSAGE_ID_PATTERN),
  language: z.enum(CORPUS_LANGUAGES),
  /** Editorial label (D-21), distinct from the measures. */
  complexity: z.enum(CORPUS_COMPLEXITIES),
  /** The typed text: `normalizePassage(sourceText)` under the file's normalisation version. */
  text: text(MAX_PASSAGE_LENGTH),
  sourceText: text(MAX_SOURCE_TEXT_LENGTH),
  /** Typographic changes from the source (normalisation steps, removed source markup). */
  adaptations: z.array(text(300)).max(50),
  source,
  wordCount: z.int().min(MIN_TEXT_WORDS),
  measures,
  editorial: z.strictObject({ level: text(100), theme: text(200), reserves: z.array(text(500)).max(20), escalated: z.boolean() }),
  checks: z.strictObject({ sourceVerifiedAt: date, engineAcceptedAt: date, engineVersion: text(100) }),
  status: z.enum(CORPUS_ENTRY_STATUSES),
});

export const corpusFileSchema = z.strictObject({
  corpusVersion: z.string().regex(CORPUS_VERSION_PATTERN),
  /** Only the engine's current version can be checked: an older corpus is normalised again first. */
  normalizationVersion: z.literal(NORMALIZATION_VERSION),
  language: z.enum(CORPUS_LANGUAGES),
  generatedAt: date,
  measuredWith,
  passages: z.array(corpusPassageSchema).min(1).max(500),
});

export type CorpusFile = z.infer<typeof corpusFileSchema>;
export type CorpusPassage = z.infer<typeof corpusPassageSchema>;
export type MeasuredWith = z.infer<typeof measuredWith>;
