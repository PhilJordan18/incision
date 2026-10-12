import { describe, expect, it } from "vitest";
import { generateRaceText, normalizePassage, raceTextRefusal, type RandomTextSettings, type RandomWords } from "../../../packages/domain/src/index";

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

  it("normalises long runs of spaces and marks in linear time", () => {
    const started = performance.now();
    normalizePassage(`a${" ".repeat(50_000)}b${"-".repeat(50_000)}c${" ;".repeat(20_000)}`, "fr");
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
