import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId } from "../ids";
import { createRace } from "../race/create";
import { asRandomState, createRandom, PRNG_VERSION, type RandomState } from "../random/prng";
import { asInstant } from "../time";
import type { WordList } from "../words/types";
import { passageCut, type Passage } from "./coherent";
import { generateRaceText, raceTextRefusal, raceTextViolations, TEXT_GENERATOR_VERSION, type RaceTextResult } from "./generate";
import { NORMALIZATION_VERSION } from "./normalize";
import type { RandomWords } from "./random";
import { COMPLEXITIES, COMPLEXITY_CRITERIA, CRITERIA_VERSION, type CoherentTextSettings, type RandomTextSettings, type TextOptions } from "./settings";
import { EN_TEST_EXCLUSIONS, EN_TEST_LIST, EN_TEST_PAIRS, FR_TEST_EXCLUSIONS, FR_TEST_LIST, FR_TEST_PAIRS, TEST_PASSAGES } from "./text.fixtures";
import { tokensOf } from "./words";

const states = createRandom([0x1234_5678, 0x9abc_def0, 0x0fed_cba9, 0x8765_4321]);
const STATES: readonly RandomState[] = Array.from({ length: 400 }, () => asRandomState([states.uint32(), states.uint32(), states.uint32(), (states.uint32() | 1) >>> 0]));
const WORDS: Readonly<Record<"fr" | "en", RandomWords>> = {
  fr: { list: FR_TEST_LIST, exclusions: FR_TEST_EXCLUSIONS, pairs: FR_TEST_PAIRS },
  en: { list: EN_TEST_LIST, exclusions: EN_TEST_EXCLUSIONS, pairs: EN_TEST_PAIRS },
};
const ALL_ON: TextOptions = { punctuation: true, numbers: true, capitals: true, accents: true };
const OPTION_SETS: readonly TextOptions[] = Array.from({ length: 16 }, (_, bits) => ({ punctuation: (bits & 1) > 0, numbers: (bits & 2) > 0, capitals: (bits & 4) > 0, accents: (bits & 8) > 0 }));

const randomSettings = (overrides: Partial<RandomTextSettings> = {}): RandomTextSettings => ({
  kind: "random",
  language: "fr",
  wordCount: 50,
  complexity: "medium",
  options: ALL_ON,
  include: [],
  exclude: [],
  ...overrides,
});
const coherentSettings = (overrides: Partial<CoherentTextSettings> = {}): CoherentTextSettings => ({ kind: "coherent", language: "fr", wordCount: 50, complexity: "medium", options: ALL_ON, ...overrides });
const wordList = (language: "fr" | "en", words: readonly string[]): WordList => ({ language, version: "custom", entries: words.map((word, index) => ({ word, zipf: 6 - index / 100 })) });
const custom = (words: readonly string[], pairs: readonly (readonly [string, string])[] = []): RandomWords => ({
  list: wordList("en", words),
  exclusions: { language: "en", version: "custom", words: [] },
  pairs: { language: "en", version: "custom", pairs },
});

function text(result: RaceTextResult): string {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.text;
}

function acceptedByCreateRace(raceText: string): boolean {
  return createRace({
    raceId: asRaceId("race-1"),
    text: raceText,
    errorMode: "mandatory",
    timeLimit: null,
    participants: [
      { entrantId: asEntrantId("a"), kind: "human" },
      { entrantId: asEntrantId("b"), kind: "human" },
    ],
    now: asInstant(1_000_000),
  }).ok;
}

describe("generateRaceText: every supported combination (CONF-04 to CONF-06)", () => {
  it("random mode: 16 option sets × 3 complexities × 2 languages × 10, 50 and 200 words, two seeds each", () => {
    let generated = 0;
    for (const language of ["fr", "en"] as const) {
      for (const complexity of COMPLEXITIES) {
        for (const options of OPTION_SETS) {
          for (const wordCount of [10, 50, 200]) {
            for (const state of STATES.slice(0, 2)) {
              const result = generateRaceText({ settings: randomSettings({ language, complexity, options, wordCount }), words: WORDS[language], state });
              expect(acceptedByCreateRace(text(result))).toBe(true);
              generated += 1;
            }
          }
        }
      }
    }
    expect(generated).toBe(576);
  }, 30_000);

  it("coherent mode: the same sweep on the synthetic passages", () => {
    for (const language of ["fr", "en"] as const) {
      for (const complexity of COMPLEXITIES) {
        for (const options of OPTION_SETS) {
          for (const wordCount of [10, 50, 200]) {
            const result = generateRaceText({ settings: coherentSettings({ language, complexity, options, wordCount }), passages: TEST_PASSAGES, state: STATES[0] as RandomState });
            expect(acceptedByCreateRace(text(result))).toBe(true);
          }
        }
      }
    }
  }, 30_000);
});

describe("generateRaceText: guarantees on the final text", () => {
  it("is deterministic, and another seed almost always gives another text", () => {
    const input = { settings: randomSettings(), words: WORDS.fr, state: STATES[3] as RandomState };
    expect(generateRaceText(input)).toEqual(generateRaceText(input));
    const texts = STATES.slice(0, 200).map((state) => text(generateRaceText({ ...input, state })));
    expect(new Set(texts).size).toBeGreaterThan(198);
  });

  it("holds every included character and no excluded one, after capitals and marks", () => {
    for (const state of STATES.slice(0, 50)) {
      const result = text(generateRaceText({ settings: randomSettings({ language: "en", wordCount: 10, include: ["Z", "q", "5", "!"], exclude: ["o", "."] }), words: WORDS.en, state }));
      const lower = result.toLowerCase();
      expect(["z", "q", "5", "!"].every((character) => lower.includes(character))).toBe(true);
      expect(lower.includes("o") || lower.includes(".")).toBe(false);
    }
  });

  it("never puts a forbidden pair or the same word side by side", () => {
    for (const state of STATES.slice(0, 200)) {
      const words = tokensOf(text(generateRaceText({ settings: randomSettings({ complexity: "easy", options: { ...ALL_ON, punctuation: false, numbers: false, capitals: false } }), words: WORDS.fr, state })));
      for (let index = 1; index < words.length; index += 1) {
        const pair = [words[index - 1], words[index]].sort().join(" ");
        expect(["mer port", "vent voile"]).not.toContain(pair);
        expect(words[index]).not.toBe(words[index - 1]);
      }
    }
  });

  it("allows repeats when the pool holds one word (Q-7) and reports the pool size", () => {
    const result = generateRaceText({ settings: randomSettings({ language: "en", wordCount: 10, options: { punctuation: false, numbers: false, capitals: false, accents: true } }), words: custom(["sea"]), state: STATES[0] as RandomState });
    expect(result).toMatchObject({ ok: true, text: Array.from({ length: 10 }, () => "sea").join(" "), provenance: { kind: "random", poolSize: 1 } });
  });

  it("draws numbers within the complexity's range, without leading zeros", () => {
    for (const state of STATES.slice(0, 50)) {
      const numbers = tokensOf(text(generateRaceText({ settings: randomSettings({ complexity: "easy", options: { ...ALL_ON, punctuation: false } }), words: WORDS.fr, state }))).filter((token) => /^\d+$/u.test(token));
      expect(numbers.length).toBeGreaterThan(0);
      expect(numbers.every((number) => Number(number) <= 99 && !(number.length > 1 && number.startsWith("0")))).toBe(true);
    }
  });

  it("spaces French high marks and attaches English ones", () => {
    const french = text(generateRaceText({ settings: randomSettings({ include: ["?", "!"] }), words: WORDS.fr, state: STATES[1] as RandomState }));
    expect(french).toMatch(/\S \?/u);
    expect(french).not.toMatch(/[\p{L}\d][?!;:]/u);
    const english = text(generateRaceText({ settings: randomSettings({ language: "en", include: ["?", "!"] }), words: WORDS.en, state: STATES[1] as RandomState }));
    expect(english).not.toMatch(/ [?!;:]/u);
  });

  it("starts every sentence with a capital when capitals are on", () => {
    for (const state of STATES.slice(0, 30)) {
      const tokens = tokensOf(text(generateRaceText({ settings: randomSettings({ options: { ...ALL_ON, numbers: false } }), words: WORDS.fr, state })));
      tokens.forEach((token, index) => {
        if (index === 0 || /[.!?]"?\)?$/u.test(tokens[index - 1] ?? "")) expect(token).toMatch(/^["(]?\p{Lu}/u);
      });
    }
  });

  it("draws every word from its complexity band, checked against the list itself", () => {
    const zipf = new Map(FR_TEST_LIST.entries.map((entry) => [entry.word, entry.zipf]));
    for (const complexity of COMPLEXITIES) {
      const { maxLetters, minZipf } = COMPLEXITY_CRITERIA[complexity];
      for (const state of STATES.slice(0, 20)) {
        const words = tokensOf(text(generateRaceText({ settings: randomSettings({ complexity, options: { punctuation: false, numbers: false, capitals: false, accents: true } }), words: WORDS.fr, state })));
        expect(words.every((word) => [...word].length <= maxLetters && (zipf.get(word) ?? 0) >= minZipf)).toBe(true);
      }
    }
  });

  it("makes room for every included end mark, even in ten hard words", () => {
    for (const state of STATES.slice(0, 30)) {
      const result = text(generateRaceText({ settings: randomSettings({ complexity: "hard", wordCount: 10, include: [".", "?", "!"] }), words: WORDS.fr, state }));
      expect([".", "?", "!"].every((mark) => result.includes(mark))).toBe(true);
    }
  });

  it("records its versions and its provenance", () => {
    expect(generateRaceText({ settings: randomSettings(), words: WORDS.fr, state: STATES[0] as RandomState })).toMatchObject({
      ok: true,
      wordCount: 50,
      versions: { generator: TEXT_GENERATOR_VERSION, criteria: CRITERIA_VERSION, normalization: NORMALIZATION_VERSION, prng: PRNG_VERSION },
      provenance: { kind: "random", listVersion: "test-fixture-1", exclusionsVersion: "test-fixture-1", pairsVersion: "test-fixture-1" },
    });
  });

  it("coherent mode: the provenance rebuilds the cut, from the passage's start", () => {
    const settings = coherentSettings({ wordCount: 37, options: { ...ALL_ON, numbers: false } });
    for (const state of STATES.slice(0, 10)) {
      const result = generateRaceText({ settings, passages: TEST_PASSAGES, state });
      if (!result.ok || result.provenance.kind !== "coherent") throw new Error("expected a coherent text");
      const { passageId } = result.provenance;
      expect(passageCut(TEST_PASSAGES.find((passage) => passage.id === passageId) as Passage, settings)).toBe(result.text);
    }
  });
});

describe("refusals: proven incompatibilities, then an exhausted search", () => {
  it("refuses an empty pool", () => {
    const settings = randomSettings({ language: "en", exclude: [..."aeiouy"] });
    expect(raceTextRefusal({ settings, words: WORDS.en })).toBe("NO_COMPATIBLE_WORDS");
  });

  it("refuses an included letter that no pool word holds", () => {
    expect(raceTextRefusal({ settings: randomSettings({ complexity: "easy", include: ["w"] }), words: WORDS.fr })).toBe("INCLUDED_CHARACTER_UNAVAILABLE");
    expect(raceTextRefusal({ settings: randomSettings({ complexity: "medium", include: ["w"] }), words: WORDS.fr })).toBeUndefined();
  });

  it("refuses included letters that cannot fit in the word slots, by counting", () => {
    const words = custom(["ab", "cd", "ef", "gh", "ij", "kl", "mn", "op", "qr", "st", "uv"]);
    const settings = randomSettings({ language: "en", wordCount: 10, options: { ...ALL_ON, numbers: false }, include: [..."acegikmoqsu"] });
    expect(raceTextRefusal({ settings, words })).toBe("INCLUDED_CHARACTERS_DO_NOT_FIT");
    expect(raceTextRefusal({ settings: { ...settings, include: [..."acegikmoqs"] }, words })).toBeUndefined();
  });

  it("refuses a pool whose words may never be neighbours, when numbers cannot separate them", () => {
    const settings = randomSettings({ language: "en", wordCount: 10, options: { ...ALL_ON, numbers: false } });
    expect(raceTextRefusal({ settings, words: custom(["sea", "ship"], [["sea", "ship"]]) })).toBe("FORBIDDEN_PAIRS_UNAVOIDABLE");
  });

  it("says when the bounded search ends without a text, without claiming a proof", () => {
    // "sea" must appear (the only word with an "e") but may neighbour no word: no proof catches it.
    const words = custom(["sea", "ship", "map"], [["sea", "ship"], ["sea", "map"]]);
    const settings = randomSettings({ language: "en", wordCount: 10, options: { ...ALL_ON, numbers: false }, include: ["e"] });
    expect(raceTextRefusal({ settings, words })).toBeUndefined();
    expect(generateRaceText({ settings, words, state: STATES[0] as RandomState })).toEqual({ ok: false, reason: "TEXT_SEARCH_EXHAUSTED" });
  });

  it("refuses a coherent request no passage can serve", () => {
    expect(raceTextRefusal({ settings: coherentSettings({ wordCount: 200 }), passages: TEST_PASSAGES.filter((passage) => passage.id !== "fr-test-medium") })).toBe("NO_COMPATIBLE_PASSAGE");
  });

  it("agrees with the generator over seeded random settings", () => {
    const fuzz = createRandom(STATES[7] as RandomState);
    const pick = <T>(items: readonly T[]): T => items[fuzz.index(items.length)] as T;
    for (let round = 0; round < 300; round += 1) {
      const language = pick(["fr", "en"] as const);
      const characters = [..."aeiostzwkq0123456789.,?!;:\"("];
      const include = characters.filter(() => fuzz.index(12) === 0);
      const exclude = characters.filter((character) => !include.includes(character) && fuzz.index(10) === 0);
      const settings = randomSettings({ language, complexity: pick(COMPLEXITIES), wordCount: pick([10, 11, 50, 200]), options: pick(OPTION_SETS), include, exclude });
      const refusal = raceTextRefusal({ settings, words: WORDS[language] });
      const result = generateRaceText({ settings, words: WORDS[language], state: pick(STATES) });
      if (refusal !== undefined) expect(result).toEqual({ ok: false, reason: refusal });
      else expect(result.ok || result.reason === "TEXT_SEARCH_EXHAUSTED").toBe(true);
    }
  }, 30_000);

  it("throws on word data of another language", () => {
    expect(() => generateRaceText({ settings: randomSettings({ language: "en" }), words: WORDS.fr, state: STATES[0] as RandomState })).toThrow(RangeError);
  });
});

describe("raceTextViolations: each guarantee is checked on the final text", () => {
  const words = custom(["sea", "ship", "map", "star", "zest", "wave"], [["sea", "ship"]]);
  const settings = randomSettings({ language: "en", wordCount: 10, options: { punctuation: true, numbers: true, capitals: true, accents: true }, include: ["z"], exclude: ["k"] });
  const valid = "Star map sea star zest 12 wave map star wave.";

  it("passes a text that keeps every guarantee", () => {
    expect(raceTextViolations(valid, { settings, words })).toEqual([]);
  });

  it.each([
    ["two spaces", "Star map  sea star zest 12 wave map star wave.", "one plain space"],
    ["a line break", "Star map\nsea star zest 12 wave map star wave.", "no line break"],
    ["nine words", "Star map sea star zest 12 wave map star.", "exactly 10 words"],
    ["an untypable letter", "Stär map sea star zest 12 wave map star wave.", "typable"],
    ["a word outside the list", "Star map sea star zest 12 wave map star moon.", "is in the list"],
    ["a number opening a sentence", "Star map sea. 12 zest star wave map star wave.", "a word at each sentence start"],
    ["an excluded character", "Star map sea star zest 12 wave map star wave. k", "excluded"],
    ["a missing included character", "Star map sea star wave 12 wave map star wave.", "every included"],
    ["a word twice in a row", "Star map sea star zest 12 wave wave star map.", "twice"],
    ["a forbidden pair", "Star map sea ship zest 12 wave map star wave.", "forbidden pair"],
    ["no number", "Star map sea star zest wave map star wave sea.", "at least one number"],
    ["a leading zero", "Star map sea star zest 012 wave map star wave.", "allowed number"],
    ["no mark", "Star map sea star zest 12 wave map star wave", "at least one mark"],
    ["a mark outside the set", "Star map sea star zest 12 wave map star wave;", "available set"],
    ["a lowercase sentence start", "Star map sea. star zest 12 wave map star wave.", "capital"],
  ])("reports %s", (_label, text, rule) => {
    expect(raceTextViolations(text, { settings, words }).some((violation) => violation.includes(rule))).toBe(true);
  });

  it("reports what each option off forbids", () => {
    const off = { ...settings, include: [], exclude: [], options: { punctuation: false, numbers: false, capitals: false, accents: false } };
    const violations = raceTextViolations("Star map sea star zest 12 wave map star wave.", { settings: off, words });
    expect(violations).toEqual(expect.arrayContaining([expect.stringContaining("no digit"), expect.stringContaining("no mark"), expect.stringContaining("no capital"), expect.stringContaining("allowed number")]));
    const french: CoherentTextSettings = { kind: "coherent", language: "fr", wordCount: 10, complexity: "easy", options: off.options };
    expect(raceTextViolations("la mer est très calme et le vent souffle fort", { settings: french, passages: [] })).toEqual([expect.stringContaining("no diacritic")]);
  });
});
