import { describe, expect, it } from "vitest";
import { COMPLEXITY_CRITERIA, generateRaceText, normalizePassage, raceTextRefusal, type RandomTextSettings, type RandomWords } from "../../../packages/domain/src/index";
import { WORD_LETTERS } from "../../../packages/domain/src/text/typable";

/**
 * Cost of the engine's text generation at production size (F-02.5, security review): the engine's
 * purity guard forbids clocks, so the timing lives here. Synthetic words only, no list data.
 */
const SYLLABLES = ["ba", "be", "bi", "bo", "bu", "da", "de", "di", "do", "du", "fa", "fe", "fi", "fo", "fu", "la", "le", "li", "lo", "lu", "ma", "me", "mi", "mo", "mu", "na", "ne", "ni", "no", "nu", "pa", "pe", "pi", "po", "pu", "ra", "re", "ri", "ro"];

function syntheticWords(): RandomWords {
  const words = new Set<string>();
  for (const first of SYLLABLES) for (const second of SYLLABLES) words.add(first + second);
  for (const first of SYLLABLES) for (const second of SYLLABLES) for (const third of SYLLABLES) words.add(first + second + third);
  const entries = [...words].slice(0, 60_000).map((word, index) => ({ word, zipf: 6 - (index % 400) / 100 })).sort((a, b) => b.zipf - a.zipf);
  return { list: { language: "fr", version: "synthetic", entries }, exclusions: { language: "fr", version: "synthetic", words: ["baba"] }, pairs: { language: "fr", version: "synthetic", pairs: [["bada", "bade"]] } };
}

const settings: RandomTextSettings = {
  kind: "random",
  language: "fr",
  wordCount: 200,
  complexity: "hard",
  options: { punctuation: true, numbers: true, capitals: true, accents: true },
  include: [..."abdefilmnopru"],
  exclude: [],
};

describe("generator cost on a 60,000-word list", () => {
  const words = syntheticWords();
  const states: [number, number, number, number][] = Array.from({ length: 5 }, (_, index) => [index + 1, 0x9e37_79b9, 0x7f4a_7c15, 0x2545_f491]);

  it("checks a configuration and generates a 200-word text fast", () => {
    expect(words.list.entries.length).toBe(60_000);
    generateRaceText({ settings, words, state: states[0] as [number, number, number, number] });
    let started = performance.now();
    expect(raceTextRefusal({ settings, words })).toBeUndefined();
    const refusalMs = performance.now() - started;
    started = performance.now();
    for (const state of states) expect(generateRaceText({ settings, words, state }).ok).toBe(true);
    const generationMs = (performance.now() - started) / states.length;
    console.info(`60k words: raceTextRefusal ${refusalMs.toFixed(0)} ms, generateRaceText ${generationMs.toFixed(0)} ms per text`);
    // Generous bounds for slow CI machines; the measured values are reported in the PR.
    expect(refusalMs).toBeLessThan(500);
    expect(generationMs).toBeLessThan(1_500);
  }, 60_000);

  it("ends a search no count can refuse within its work budget", () => {
    // Every word holds "a" and two of b to i, so three words never hold the nine letters, and no
    // proof sees it: each cover is abandoned at its fourth word, until the budget is spent.
    const triples = [..."bcdefghi"].flatMap((first, index, all) => all.slice(index + 1).map((second) => `a${first}${second}`));
    const tail = [..."jklmnpqrstuvwxyz"];
    const hard: string[] = [];
    for (const one of tail) for (const two of tail) for (const three of tail) for (const triple of triples) hard.push(`${triple}${one}${two}${three}`);
    const exhausting: RandomWords = { ...words, list: { language: "en", version: "synthetic", entries: hard.slice(0, 60_000).map((word) => ({ word, zipf: 5 })) }, exclusions: { language: "en", version: "synthetic", words: [] }, pairs: { language: "en", version: "synthetic", pairs: [] } };
    const criteria = { ...COMPLEXITY_CRITERIA, hard: { ...COMPLEXITY_CRITERIA.hard, maxNumber: 9 } };
    const failing: RandomTextSettings = { ...settings, language: "en", wordCount: 10, include: [..."abcdefghi0123456"] };
    expect(raceTextRefusal({ settings: failing, words: exhausting }, criteria)).toBeUndefined();
    generateRaceText({ settings: failing, words: exhausting, state: states[0] as [number, number, number, number], criteria });
    const started = performance.now();
    for (const state of states) expect(generateRaceText({ settings: failing, words: exhausting, state, criteria })).toEqual({ ok: false, reason: "TEXT_SEARCH_EXHAUSTED" });
    const exhaustedMs = (performance.now() - started) / states.length;
    console.info(`60k words: exhausted search ${exhaustedMs.toFixed(0)} ms per call`);
    expect(exhaustedMs).toBeLessThan(1_500);
  }, 60_000);

  it("stays bounded on words of 16 letters, the longest a hard text allows", () => {
    // Every word holds the same 14 letters and 2 of the 26 others (security review): the slowest shape
    // for the proofs and the covers. Ten words cannot hold all 40 letters; two hundred can.
    const letters = [...WORD_LETTERS.fr].filter((letter) => !"œæ".includes(letter));
    const [fixed, others] = [letters.slice(0, 14), letters.slice(14)];
    const long = new Set<string>();
    for (let turn = 0; turn < 14 && long.size < 60_000; turn += 1) {
      for (let first = 0; first < 16 && long.size < 60_000; first += 1) {
        for (let second = first + 1; second < 16 && long.size < 60_000; second += 1) {
          for (let x = 0; x < others.length; x += 1) {
            for (let y = x + 1; y < others.length && long.size < 60_000; y += 1) {
              const word = [...fixed.slice(turn), ...fixed.slice(0, turn)];
              word.splice(first, 0, others[x] as string);
              word.splice(second, 0, others[y] as string);
              long.add(word.join(""));
            }
          }
        }
      }
    }
    const sixteen: RandomWords = { ...words, list: { language: "fr", version: "synthetic", entries: [...long].map((word) => ({ word, zipf: 5 })) }, exclusions: { language: "fr", version: "synthetic", words: [] }, pairs: { language: "fr", version: "synthetic", pairs: [] } };
    const failing: RandomTextSettings = { ...settings, wordCount: 10, include: [...letters, ..."0123456789", ".", "?", "!", ",", ";", ":", '"', "("] };
    const succeeding: RandomTextSettings = { ...settings, include: letters };
    generateRaceText({ settings: failing, words: sixteen, state: states[0] as [number, number, number, number] });
    let started = performance.now();
    expect(raceTextRefusal({ settings: failing, words: sixteen })).toBeUndefined();
    const refusalMs = performance.now() - started;
    started = performance.now();
    for (const state of states) expect(generateRaceText({ settings: failing, words: sixteen, state })).toEqual({ ok: false, reason: "TEXT_SEARCH_EXHAUSTED" });
    const exhaustedMs = (performance.now() - started) / states.length;
    started = performance.now();
    for (const state of states) expect(generateRaceText({ settings: succeeding, words: sixteen, state }).ok).toBe(true);
    const textMs = (performance.now() - started) / states.length;
    console.info(`60k words of 16 letters: raceTextRefusal ${refusalMs.toFixed(0)} ms, exhausted search ${exhaustedMs.toFixed(0)} ms, 200-word text ${textMs.toFixed(0)} ms`);
    expect(Math.max(refusalMs, exhaustedMs, textMs)).toBeLessThan(1_500);
  }, 60_000);

  it("normalises long runs of spaces and marks in linear time", () => {
    const started = performance.now();
    normalizePassage(`a${" ".repeat(50_000)}b${"-".repeat(50_000)}c${" ;".repeat(20_000)}`, "fr");
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
