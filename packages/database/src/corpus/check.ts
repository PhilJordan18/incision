import { isDeepStrictEqual } from "node:util";
import {
  asRandomState,
  checkPassages,
  countWords,
  generateRaceText,
  normalizePassage,
  type Passage,
  passageCut,
  TEXT_LANGUAGES,
  type TextLanguage,
} from "@incision/domain";
import type { z } from "zod";
import { defaultCoherentSettings } from "./defaults";
import { type CorpusFile, corpusFileSchema, type CorpusPassage, type MeasuredWith, PASSAGE_ID_PATTERN } from "./format";
import { type PassageIdentity, passageContentHash, type VersionEntry, versionChecksum } from "./hash";

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
  readonly language?: TextLanguage;
  readonly passageId?: string;
  readonly detail: string;
};

export type CheckedPassage = CorpusPassage & { readonly identity: PassageIdentity; readonly contentHash: string };

/** A corpus version that passed every check, ready to import. */
export type CheckedCorpus = {
  readonly version: string;
  readonly normalizationVersion: number;
  readonly measuredWith: MeasuredWith;
  /** SHA-256 of the canonical content of the whole version (`versionChecksum`). */
  readonly checksum: string;
  readonly passages: readonly CheckedPassage[];
  /** Retained passages that can serve D-19's defaults, per language (each at least 1). */
  readonly compatibleWithDefaults: Readonly<Record<TextLanguage, number>>;
};

export type CorpusCheck = { readonly ok: true; readonly corpus: CheckedCorpus } | { readonly ok: false; readonly refusal: CorpusRefusal };

const refuse = (refusal: CorpusRefusal): CorpusCheck => ({ ok: false, refusal });

/** A passage's identity under its corpus's normalisation version. */
export function passageIdentity(passage: CorpusPassage, normalizationVersion: number): PassageIdentity {
  const { id, language, text, sourceText, adaptations, source, wordCount } = passage;
  return { id, language, text, normalizationVersion, sourceText, adaptations, source, wordCount };
}

/** What a version says of a checked passage, for its checksum. */
export function versionEntry(passage: CheckedPassage): VersionEntry {
  const { identity, status, complexity, measures, editorial, checks } = passage;
  return { identity, status, complexity, measures, editorial, checks };
}

/** The first format issue, with the id of the passage it is in when the file names one. */
function formatRefusal(error: z.ZodError, raw: unknown, language: TextLanguage): CorpusRefusal {
  const [issue] = error.issues;
  const where = issue === undefined ? "(file)" : issue.path.join(".") || "(file)";
  const [field, index] = issue?.path ?? [];
  let passageId: string | undefined;
  if (field === "passages" && typeof index === "number" && raw !== null && typeof raw === "object" && "passages" in raw && Array.isArray(raw.passages)) {
    const passage: unknown = raw.passages[index];
    // Only a well-formed id: an unchecked one could carry terminal escapes into the operator's output.
    if (passage !== null && typeof passage === "object" && "id" in passage && typeof passage.id === "string" && passage.id.length <= 120 && PASSAGE_ID_PATTERN.test(passage.id)) {
      passageId = passage.id;
    }
  }
  return { code: "INVALID_FORMAT", language, ...(passageId === undefined ? {} : { passageId }), detail: `${where}: ${issue?.message ?? "invalid file"}` };
}

/**
 * Checks one corpus version, a file per language, before anything is written (F-02.3a): format,
 * one header for both files, measures taken under the corpus's own normalisation version,
 * languages, unique ids, the typed text equal to the engine's normalisation of the exact source,
 * D-10's word count, and, per language, retained passages that really serve D-19's defaults (a
 * draw is made). Pure.
 */
export function checkCorpus(files: Readonly<Partial<Record<TextLanguage, unknown>>>): CorpusCheck {
  const parsed: CorpusFile[] = [];
  for (const language of TEXT_LANGUAGES) {
    const raw = files[language];
    if (raw === undefined) {
      return refuse({ code: "MISSING_LANGUAGE", language, detail: `no ${language} file` });
    }
    const file = corpusFileSchema.safeParse(raw);
    if (!file.success) {
      return refuse(formatRefusal(file.error, raw, language));
    }
    if (file.data.language !== language) {
      return refuse({ code: "WRONG_LANGUAGE", language, detail: `the ${language} file says ${file.data.language}` });
    }
    if (file.data.measuredWith.normalizationVersion !== file.data.normalizationVersion) {
      return refuse({
        code: "MEASURED_WITH_MISMATCH",
        language,
        detail: `measured under normalisation version ${file.data.measuredWith.normalizationVersion}, the corpus is version ${file.data.normalizationVersion}`,
      });
    }
    parsed.push(file.data);
  }
  const [first] = parsed;
  if (first === undefined) {
    return refuse({ code: "MISSING_LANGUAGE", detail: "no file" });
  }
  for (const file of parsed) {
    if (file.corpusVersion !== first.corpusVersion || !isDeepStrictEqual(file.measuredWith, first.measuredWith)) {
      return refuse({ code: "MIXED_HEADERS", language: file.language, detail: "every file of a version has the same version and measurement setting" });
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
      const identity = passageIdentity(passage, file.normalizationVersion);
      passages.push({ ...passage, identity, contentHash: passageContentHash(identity) });
    }
  }

  try {
    // The engine's own check of a corpus, the one loading the active version runs again.
    checkPassages(passages.map(({ id, language, complexity, text }) => ({ id, language, complexity, text })));
  } catch (error: unknown) {
    return refuse({ code: "NOT_NORMALISED", detail: error instanceof Error ? error.message : "refused by checkPassages" });
  }

  const compatibleWithDefaults: Record<TextLanguage, number> = { fr: 0, en: 0 };
  for (const language of TEXT_LANGUAGES) {
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
      checksum: versionChecksum(first.corpusVersion, first.normalizationVersion, first.measuredWith, passages.map(versionEntry)),
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
