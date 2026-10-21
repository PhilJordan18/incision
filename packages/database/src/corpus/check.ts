import { createHash } from "node:crypto";
import {
  asRandomState,
  checkPassages,
  type CoherentTextSettings,
  countWords,
  generateRaceText,
  normalizePassage,
  type Passage,
  passageCut,
} from "@incision/domain";
import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import { CORPUS_LANGUAGES, type CorpusLanguage } from "../schema/corpus";
import { type CorpusFile, corpusFileSchema, type CorpusPassage, type MeasuredWith } from "./format";

/**
 * D-19's coherent text defaults (Philippe's decision 1 of October 21): the settings every
 * language of an active corpus must be able to serve. F-02.3b starts races with them until the
 * host can choose (F-03.1).
 */
export function defaultCoherentSettings(language: CorpusLanguage): CoherentTextSettings {
  return {
    kind: "coherent",
    language,
    wordCount: 50,
    complexity: "medium",
    options: { punctuation: true, numbers: false, capitals: true, accents: true },
  };
}

export type CorpusRefusalCode =
  | "INVALID_FORMAT"
  | "MISSING_LANGUAGE"
  | "MIXED_HEADERS"
  | "WRONG_LANGUAGE"
  | "DUPLICATE_ID"
  | "NOT_NORMALISED"
  | "WORD_COUNT_MISMATCH"
  | "MEASURED_WITH_MISMATCH"
  | "NO_DEFAULT_PASSAGE";

/** Why a corpus version cannot be imported; `passageId` names the faulty passage when there is one. */
export type CorpusRefusal = {
  readonly code: CorpusRefusalCode;
  readonly language?: CorpusLanguage;
  readonly passageId?: string;
  readonly detail: string;
};

export type CheckedPassage = CorpusPassage & { readonly contentHash: string };

/** A corpus version that passed every check, ready to import. */
export type CheckedCorpus = {
  readonly version: string;
  readonly normalizationVersion: number;
  readonly measuredWith: MeasuredWith;
  /** SHA-256 of the canonical content of the whole version (both languages, statuses included). */
  readonly checksum: string;
  readonly passages: readonly CheckedPassage[];
  /** Retained passages that can serve D-19's defaults, per language (each at least 1). */
  readonly compatibleWithDefaults: Readonly<Record<CorpusLanguage, number>>;
};

export type CorpusCheck = { readonly ok: true; readonly corpus: CheckedCorpus } | { readonly ok: false; readonly refusal: CorpusRefusal };

const refuse = (refusal: CorpusRefusal): CorpusCheck => ({ ok: false, refusal });

/** JSON with object keys sorted at every level: the same content always hashes the same. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sha256 = (value: unknown): string => createHash("sha256").update(canonicalJson(value)).digest("hex");

/** A passage's content: everything but its status, which belongs to a version. */
export function passageContentHash(passage: CorpusPassage): string {
  return sha256({ ...passage, status: undefined });
}

function formatIssue(error: z.ZodError): string {
  const [issue] = error.issues;
  return issue === undefined ? "invalid file" : `${issue.path.join(".") || "(file)"}: ${issue.message}`;
}

/**
 * Checks one corpus version, a file per language, before anything is written (F-02.3a): format,
 * one header for both files, languages, unique ids, the typed text equal to the engine's
 * normalisation of the exact source, D-10's word count, one measurement setting, and, per
 * language, retained passages that really serve D-19's defaults (a draw is made). Pure.
 */
export function checkCorpus(files: Readonly<Partial<Record<CorpusLanguage, unknown>>>): CorpusCheck {
  const parsed: CorpusFile[] = [];
  for (const language of CORPUS_LANGUAGES) {
    const raw = files[language];
    if (raw === undefined) {
      return refuse({ code: "MISSING_LANGUAGE", language, detail: `no ${language} file` });
    }
    const file = corpusFileSchema.safeParse(raw);
    if (!file.success) {
      return refuse({ code: "INVALID_FORMAT", language, detail: formatIssue(file.error) });
    }
    if (file.data.language !== language) {
      return refuse({ code: "WRONG_LANGUAGE", language, detail: `the ${language} file says ${file.data.language}` });
    }
    parsed.push(file.data);
  }
  const [first] = parsed;
  if (first === undefined) {
    return refuse({ code: "MISSING_LANGUAGE", detail: "no file" });
  }
  for (const file of parsed) {
    if (file.corpusVersion !== first.corpusVersion || file.normalizationVersion !== first.normalizationVersion || !isDeepStrictEqual(file.measuredWith, first.measuredWith)) {
      return refuse({ code: "MIXED_HEADERS", language: file.language, detail: "every file of a version has the same version, normalisation and measurement setting" });
    }
  }

  const ids = new Set<string>();
  const passages: CheckedPassage[] = [];
  for (const file of parsed) {
    for (const passage of file.passages) {
      const refusal = passageRefusal(passage, file);
      if (refusal !== undefined) {
        return refuse(refusal);
      }
      if (ids.has(passage.id)) {
        return refuse({ code: "DUPLICATE_ID", passageId: passage.id, detail: "the same id twice in a version" });
      }
      ids.add(passage.id);
      passages.push({ ...passage, contentHash: passageContentHash(passage) });
    }
  }

  try {
    // The engine's own check of a corpus, the one F-02.3b runs again when it loads the version.
    checkPassages(passages.map(({ id, language, complexity, text }) => ({ id, language, complexity, text })));
  } catch (error: unknown) {
    return refuse({ code: "NOT_NORMALISED", detail: error instanceof Error ? error.message : "refused by checkPassages" });
  }

  const compatibleWithDefaults = { fr: 0, en: 0 };
  for (const language of CORPUS_LANGUAGES) {
    const retained: Passage[] = passages
      .filter((passage) => passage.language === language && passage.status === "retained")
      .map(({ id, complexity, text }) => ({ id, language, complexity, text }));
    const settings = defaultCoherentSettings(language);
    compatibleWithDefaults[language] = retained.filter((passage) => passageCut(passage, settings) !== undefined).length;
    // Not a count only: the engine itself must accept to draw a text for these settings.
    const draw = generateRaceText({ settings, passages: retained, state: asRandomState([1, 2, 3, 4]) });
    if (compatibleWithDefaults[language] === 0 || !draw.ok) {
      return refuse({ code: "NO_DEFAULT_PASSAGE", language, detail: `no retained ${language} passage serves the default settings (coherent, 50 words, medium)` });
    }
  }

  passages.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    ok: true,
    corpus: {
      version: first.corpusVersion,
      normalizationVersion: first.normalizationVersion,
      measuredWith: first.measuredWith,
      checksum: sha256({ version: first.corpusVersion, normalizationVersion: first.normalizationVersion, measuredWith: first.measuredWith, passages }),
      passages,
      compatibleWithDefaults,
    },
  };
}

function passageRefusal(passage: CorpusPassage, file: CorpusFile): CorpusRefusal | undefined {
  const at = { language: file.language, passageId: passage.id };
  if (passage.language !== file.language || !passage.id.startsWith(`${file.language}-`)) {
    return { code: "WRONG_LANGUAGE", ...at, detail: `a ${passage.language} passage in the ${file.language} file` };
  }
  const normalised = normalizePassage(passage.sourceText, passage.language);
  if (!normalised.ok) {
    return { code: "NOT_NORMALISED", ...at, detail: `the source text cannot be normalised (${normalised.reason} at ${normalised.position})` };
  }
  if (normalised.text !== passage.text) {
    return { code: "NOT_NORMALISED", ...at, detail: `the text is not normalizePassage(sourceText), version ${file.normalizationVersion}` };
  }
  if (countWords(passage.text) !== passage.wordCount) {
    return { code: "WORD_COUNT_MISMATCH", ...at, detail: `wordCount ${passage.wordCount}, D-10 counts ${countWords(passage.text)}` };
  }
  if (!isDeepStrictEqual(passage.measures.measuredWith, file.measuredWith)) {
    return { code: "MEASURED_WITH_MISMATCH", ...at, detail: "measured with another setting than the file's" };
  }
  return undefined;
}
