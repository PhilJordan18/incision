import { describe, expect, it } from "vitest";
import * as engine from "../../index";
import { buildWordPool, foldForExclusion, forbiddenPairRule } from "../pool";
import { TEXT_LANGUAGES } from "../types";
import { EN_WORDS } from "./en";
import { EN_EXCLUSIONS, FR_EXCLUSIONS } from "./exclusions";
import { WORD_DATA_SENTINEL } from "./format";
import { FR_WORDS } from "./fr";
import * as words from "./index";
import { EN_PAIRS, FR_PAIRS } from "./pairs";
import { usesWordLetters } from "../../text/typable";

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
    expect(words.WORD_DATA_NOTICE).toContain("wordfreq 3.1.1");
    expect(words.WORD_DATA_NOTICE).toContain("CC BY-SA 4.0");
  });
});

describe("the reviewed lists wf311-r1 (#42)", () => {
  it.each(TEXT_LANGUAGES)("ships approved %s data, never the fixtures the extension refuses", (language) => {
    for (const version of [words.WORD_LISTS[language].version, words.EXCLUSIONS[language].version, words.FORBIDDEN_PAIRS[language].version]) {
      expect(version).toBe("wf311-r1");
    }
    // Zipf 3.50 or more, after the editorial removals: thousands of words, never a handful.
    expect(words.WORD_LISTS[language].entries.length).toBeGreaterThan(10_000);
    expect(words.WORD_LISTS[language].entries.every((entry) => entry.zipf >= 3.5 && usesWordLetters(entry.word, language))).toBe(true);
  });

  it.each([
    ["fr", ["merde", "putain", "connard", "salope", "pute", "nègre", "enculé"]],
    ["en", ["fuck", "shit", "bitch", "cunt", "whore", "nigga", "retarded"]],
  ] as const)("excludes the %s swear words, insults and slurs the review named, on folded forms", (language, sample) => {
    const excluded = new Set(words.EXCLUSIONS[language].words.map(foldForExclusion));
    const listed = new Set(words.WORD_LISTS[language].entries.map((entry) => foldForExclusion(entry.word)));
    for (const word of sample.filter((candidate) => excluded.has(foldForExclusion(candidate)))) {
      expect(listed.has(foldForExclusion(word))).toBe(false);
    }
    // At least the words of the sample that reach the frequency floor are in the exclusions.
    expect(sample.filter((word) => excluded.has(foldForExclusion(word))).length).toBeGreaterThanOrEqual(4);
  });

  it.each(TEXT_LANGUAGES)("keeps identity terms drawable in %s: no blanket removal, only forbidden neighbours", (language) => {
    const identity = language === "fr" ? ["juif", "noir", "arabe", "musulman", "gay"] : ["black", "gay", "deaf", "lesbian"];
    const hostile = language === "fr" ? "sale" : "dirty";
    const listed = new Set(words.WORD_LISTS[language].entries.map((entry) => entry.word));
    const rule = forbiddenPairRule(words.FORBIDDEN_PAIRS[language]);
    for (const word of identity) {
      expect(listed.has(word)).toBe(true);
      expect(rule(hostile, word)).toBe(true);
      expect(rule(word, hostile)).toBe(true);
    }
  });

  it.each(TEXT_LANGUAGES)("names only playable %s words in its forbidden pairs", (language) => {
    const listed = new Set(words.WORD_LISTS[language].entries.map((entry) => entry.word));
    expect(words.FORBIDDEN_PAIRS[language].pairs.every(([first, second]) => listed.has(first) && listed.has(second))).toBe(true);
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
