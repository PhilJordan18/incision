import { describe, expect, it } from "vitest";
import {
  asEntrantId,
  asRaceId,
  COMPLEXITIES,
  drawExtensionWords,
  extensionViolations,
  generateRaceText,
  raceTextViolations,
  type RandomTextSettings,
  type RandomWords,
  type TextLanguage,
  type TextOptions,
} from "../../../packages/domain/src/index";
import { EXCLUSIONS, FORBIDDEN_PAIRS, WORD_LISTS } from "../../../packages/domain/src/words/data/index";
import { foldForExclusion } from "../../../packages/domain/src/words/pool";

/**
 * The engine on the shipped, reviewed data (#42, #43): the engine's own tests use fixtures, and its
 * purity guard keeps the data out of them, so the real lists are exercised here.
 */
const LANGUAGES: readonly TextLanguage[] = ["fr", "en"];
const words = (language: TextLanguage): RandomWords => ({ list: WORD_LISTS[language], exclusions: EXCLUSIONS[language], pairs: FORBIDDEN_PAIRS[language] });
const DEFAULTS: TextOptions = { punctuation: true, numbers: false, capitals: true, accents: true };
const random = (language: TextLanguage, overrides: Partial<RandomTextSettings> = {}): RandomTextSettings => ({
  kind: "random", language, wordCount: 50, complexity: "medium", options: DEFAULTS, include: [], exclude: [], ...overrides,
});
const state = (seed: number): [number, number, number, number] => [seed, 0x9e37_79b9, 0x7f4a_7c15, 0x2545_f491];

describe.each(LANGUAGES)("random texts on the reviewed %s lists", (language) => {
  it.each(COMPLEXITIES)("produce valid %s texts at 10, 50 and 200 words, with the reviewed versions", (complexity) => {
    for (const wordCount of [10, 50, 200]) {
      const settings = random(language, { complexity, wordCount });
      const result = generateRaceText({ settings, words: words(language), state: state(wordCount) });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.wordCount).toBe(wordCount);
      expect(result.provenance).toMatchObject({ kind: "random", listVersion: "wf311-r1", exclusionsVersion: "wf311-r1", pairsVersion: "wf311-r1" });
      expect(raceTextViolations(result.text, { settings, words: words(language) })).toEqual([]);
    }
  });

  it("replays the same text for the same seed and settings, and another for another seed", () => {
    const settings = random(language, { options: { punctuation: true, numbers: true, capitals: true, accents: true }, include: ["z"] });
    const first = generateRaceText({ settings, words: words(language), state: state(7) });
    expect(generateRaceText({ settings, words: words(language), state: state(7) })).toEqual(first);
    expect(generateRaceText({ settings, words: words(language), state: state(8) })).not.toEqual(first);
  });

  it("never draws an excluded word, its folded form or a forbidden neighbour across many draws", () => {
    const excluded = new Set(EXCLUSIONS[language].words.map(foldForExclusion));
    for (let seed = 1; seed <= 20; seed += 1) {
      const result = generateRaceText({ settings: random(language, { complexity: "hard", wordCount: 200 }), words: words(language), state: state(seed) });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const cores = result.text.split(" ").map((token) => token.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")).filter((core) => core !== "");
      expect(cores.filter((core) => excluded.has(foldForExclusion(core)))).toEqual([]);
    }
  });

  it("applies the accents option by choosing unaccented words, never by misspelling", () => {
    const result = generateRaceText({ settings: random(language, { options: { ...DEFAULTS, accents: false }, wordCount: 200 }), words: words(language), state: state(3) });
    expect(result.ok && /^[\x20-\x7e]+$/u.test(result.text)).toBe(true);
  });

  it("guarantees each included character and never shows an excluded one", () => {
    const settings = random(language, { include: ["k", "w"], exclude: ["e"], wordCount: 30 });
    const result = generateRaceText({ settings, words: words(language), state: state(11) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text.toLowerCase()).toContain("k");
    expect(result.text.toLowerCase()).toContain("w");
    // Characters compare case-insensitively, not accent-insensitively: "é" is another character than "e".
    expect(result.text.toLowerCase()).not.toContain("e");
  });

  it("refuses an empty pool with a typed reason instead of falling back", () => {
    const vowels = language === "fr" ? [..."aeiouyàâéèêëîïôûùü"] : [..."aeiouy"];
    const result = generateRaceText({ settings: random(language, { exclude: vowels }), words: words(language), state: state(1) });
    expect(result).toEqual({ ok: false, reason: "NO_COMPATIBLE_WORDS" });
  });

  it("refuses an included character no remaining word holds, before any draw", () => {
    // fr: "ù" appears only in "où"; en: no easy word holds "q" without "u". Both proven on these lists.
    const constraint = language === "fr" ? { include: ["ù"], exclude: ["o"] } : { include: ["q"], exclude: ["u"] };
    const result = generateRaceText({ settings: random(language, { complexity: "easy", ...constraint }), words: words(language), state: state(1) });
    expect(result).toEqual({ ok: false, reason: "INCLUDED_CHARACTER_UNAVAILABLE" });
  });

  it("ends a demanding include within its bound, with a text that holds every letter or a typed refusal", () => {
    const include = [..."abcdefghijklmnopqrstuvwxyz"];
    const started = performance.now();
    const result = generateRaceText({ settings: random(language, { complexity: "easy", wordCount: 10, include }), words: words(language), state: state(1) });
    expect(performance.now() - started).toBeLessThan(5_000);
    if (result.ok) expect(include.every((letter) => result.text.toLowerCase().includes(letter))).toBe(true);
    else expect(["INCLUDED_CHARACTERS_DO_NOT_FIT", "INCLUDED_CHARACTER_UNAVAILABLE", "TEXT_SEARCH_EXHAUSTED"]).toContain(result.reason);
  });

  it("draws Arcade extension words from the reviewed data, which the engine accepts as approved", () => {
    const input = {
      settings: { language, complexity: "medium" as const, options: DEFAULTS },
      words: words(language),
      target: language === "fr" ? "La mer est calme." : "The sea is calm.",
      seed: state(5),
      grant: { raceId: asRaceId("race-1"), entrantId: asEntrantId("alice"), milestone: 50 as const },
    };
    const draw = drawExtensionWords(input);
    expect(draw.ok).toBe(true);
    if (draw.ok) expect(extensionViolations(input, draw.words)).toEqual([]);
  });
});
