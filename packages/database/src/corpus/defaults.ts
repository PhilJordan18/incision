import type { CoherentTextSettings, TextLanguage } from "@incision/domain";

/**
 * D-19's coherent text defaults (Philippe's decision 1 of October 21): the settings races start
 * with until the host can choose (F-03.1), and the ones every language of an active corpus must
 * be able to serve (`checkCorpus`). One definition for the import and the server. A product rule
 * that may later move to @incision/domain.
 */
export function defaultCoherentSettings(language: TextLanguage): CoherentTextSettings {
  return {
    kind: "coherent",
    language,
    wordCount: 50,
    complexity: "medium",
    options: { punctuation: true, numbers: false, capitals: true, accents: true },
  };
}
