import { describe, expect, it } from "vitest";
import * as engine from "../../index";
import { buildWordPool, foldForExclusion } from "../pool";
import { TEXT_LANGUAGES } from "../types";
import { EN_WORDS } from "./en";
import { EN_EXCLUSIONS, FR_EXCLUSIONS } from "./exclusions";
import { WORD_DATA_SENTINEL } from "./format";
import { FR_WORDS } from "./fr";
import * as words from "./index";
import { EN_PAIRS, FR_PAIRS } from "./pairs";

describe("the shipped word data", () => {
  it("opens every source with the sentinel, so a leaked list is always detectable", () => {
    for (const source of [FR_WORDS, EN_WORDS, FR_EXCLUSIONS, EN_EXCLUSIONS, FR_PAIRS, EN_PAIRS]) {
      expect(source.startsWith(`${WORD_DATA_SENTINEL} `)).toBe(true);
    }
  });

  it.each(TEXT_LANGUAGES)("files each %s list under its own language, never empty", (language) => {
    expect(words.WORD_LISTS[language].language).toBe(language);
    expect(words.EXCLUSIONS[language].language).toBe(language);
    expect(words.FORBIDDEN_PAIRS[language].language).toBe(language);
    expect(words.WORD_LISTS[language].entries.length).toBeGreaterThan(0);
  });

  it.each(TEXT_LANGUAGES)("ships no excluded word in the %s list (exhaustive, folded)", (language) => {
    const excluded = new Set(words.EXCLUSIONS[language].words.map(foldForExclusion));
    expect(words.WORD_LISTS[language].entries.filter((entry) => excluded.has(foldForExclusion(entry.word)))).toEqual([]);
    expect(buildWordPool({ list: words.WORD_LISTS[language], exclusions: words.EXCLUSIONS[language] }).entries).toEqual(words.WORD_LISTS[language].entries);
  });

  it("names every data version in the notice, and says what the data are", () => {
    for (const language of TEXT_LANGUAGES) {
      for (const version of [words.WORD_LISTS[language].version, words.EXCLUSIONS[language].version, words.FORBIDDEN_PAIRS[language].version]) {
        expect(words.WORD_DATA_NOTICE).toContain(`version ${version}`);
      }
    }
    expect(words.WORD_DATA_NOTICE).toContain("no third-party data");
  });
});

describe("the server-only boundary", () => {
  it("exports exactly the data from the subpath", () => {
    expect(Object.keys(words).sort()).toEqual(["EXCLUSIONS", "FORBIDDEN_PAIRS", "WORD_DATA_NOTICE", "WORD_LISTS"]);
  });

  it("keeps the data, the sentinel and the parsers out of the package's main entry", () => {
    const names = Object.keys(engine);
    for (const name of ["WORD_LISTS", "EXCLUSIONS", "FORBIDDEN_PAIRS", "WORD_DATA_NOTICE", "WORD_DATA_SENTINEL", "parseWordListSource", "parseExclusionSource", "parsePairSource"]) {
      expect(names).not.toContain(name);
    }
    expect(names).toEqual(expect.arrayContaining(["buildWordPool", "foldForExclusion", "forbiddenPairRule", "TEXT_LANGUAGES", "createRandom"]));
  });
});
