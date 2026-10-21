import { COMPLEXITIES, MAX_PASSAGE_LENGTH, MIN_TEXT_WORDS, NORMALIZATION_VERSION, TEXT_LANGUAGES } from "@incision/domain";
import { z } from "zod";
import { CORPUS_ENTRY_STATUSES } from "../schema/corpus";

/**
 * The corpus files, one per language, in `packages/database/corpus/<version>/<language>.json`
 * (F-02.3). B authors them; the import trusts nothing in them: unknown fields are refused, and
 * every bound is checked here or in `checkCorpus`. Strings are taken as written, never trimmed.
 */

/** Invisible format characters: bidirectional controls, zero-width characters, BOM, soft hyphen, word joiner. */
const FORMAT_CHARACTERS = /\p{Cf}/u;
/** Every C0 and C1 control; a multi-line source text may hold tabs and line breaks. */
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/u;
const CONTROLS_BUT_LINES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

function cleanText(max: number, lines = false) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim() === value, { error: "surrounding whitespace" })
    .refine((value) => value.isWellFormed(), { error: "a lone surrogate" })
    .refine((value) => !FORMAT_CHARACTERS.test(value), { error: "an invisible format character" })
    .refine((value) => !(lines ? CONTROLS_BUT_LINES : CONTROLS).test(value), { error: "a control character" });
}
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
  wordfreq: cleanText(40),
  listVersion: cleanText(80),
  commonZipf: z.number().min(0).max(8),
  /** How many first words were measured (`MEASURED_WORDS`). */
  measuredWords: z.int().min(1),
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

/** Where the text comes from: part of the passage's identity. */
const source = z.strictObject({
  author: cleanText(200),
  work: cleanText(300),
  /** Where in the work: part, chapter, paragraph. */
  place: cleanText(300),
  edition: cleanText(300),
  /** Kept as written: an https URL that the platform parses, under the string rules above. */
  url: cleanText(500).refine((value) => URL.canParse(value) && new URL(value).protocol === "https:", { error: "not an https URL" }),
  /** Wikisource revision id, or Project Gutenberg eBook number. */
  revision: cleanText(100),
  licence: cleanText(500),
});

/** The checks B made, with their dates: a version's, not the passage's. */
const checks = z.strictObject({
  /** When B fetched the source text. */
  sourceRetrievedAt: date,
  /** Project Gutenberg's « Most recently updated », when known. */
  sourceFileUpdatedAt: date.optional(),
  sourceVerifiedAt: date,
  engineAcceptedAt: date,
  engineVersion: cleanText(100),
});

export const corpusPassageSchema = z.strictObject({
  id: z.string().max(120).regex(PASSAGE_ID_PATTERN),
  language: z.enum(TEXT_LANGUAGES),
  /** Editorial label (D-21), distinct from the measures. */
  complexity: z.enum(COMPLEXITIES),
  /** The typed text: `normalizePassage(sourceText)` under the file's normalisation version. */
  text: cleanText(MAX_PASSAGE_LENGTH),
  sourceText: cleanText(MAX_SOURCE_TEXT_LENGTH, true),
  /** Typographic changes from the source (normalisation steps, removed source markup). */
  adaptations: z.array(cleanText(300)).max(50),
  source,
  wordCount: z.int().min(MIN_TEXT_WORDS),
  measures,
  editorial: z.strictObject({ level: cleanText(100), theme: cleanText(200), reserves: z.array(cleanText(500)).max(20), escalated: z.boolean() }),
  checks,
  status: z.enum(CORPUS_ENTRY_STATUSES),
});

export const corpusFileSchema = z.strictObject({
  corpusVersion: z.string().regex(CORPUS_VERSION_PATTERN),
  /** Only the engine's current version can be checked: an older corpus is normalised again first. */
  normalizationVersion: z.literal(NORMALIZATION_VERSION),
  language: z.enum(TEXT_LANGUAGES),
  generatedAt: date,
  measuredWith,
  passages: z.array(corpusPassageSchema).min(1).max(500),
});

export type CorpusFile = z.infer<typeof corpusFileSchema>;
export type CorpusPassage = z.infer<typeof corpusPassageSchema>;
export type MeasuredWith = z.infer<typeof measuredWith>;
