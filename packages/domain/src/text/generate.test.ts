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

  it("counts letters that never share a word, each needing its own", () => {
    // "abcd" holds four letters, but e to i stand in separate words: with a, six words at least, for five slots.
    const words = custom(["abcd", "ee", "ff", "gg", "hh", "ii", "oo"]);
    const settings = randomSettings({ language: "en", wordCount: 10, complexity: "easy", include: [..."0123456789abcdefghi"] });
    expect(raceTextRefusal({ settings, words })).toBe("INCLUDED_CHARACTERS_DO_NOT_FIT");
    const fewer = { ...settings, include: [..."0123456789abcdefgh"] };
    expect(raceTextRefusal({ settings: fewer, words })).toBeUndefined();
    expect(generateRaceText({ settings: fewer, words, state: STATES[0] as RandomState }).ok).toBe(true);
  });

  it("counts a letter once per word, however often the word repeats it", () => {
    // Every pair of a to d shares a word, so two words are needed for the four; "aaaa" holds one letter, not four.
    const criteria = { ...COMPLEXITY_CRITERIA, easy: { ...COMPLEXITY_CRITERIA.easy, maxNumber: 9 } };
    const settings = randomSettings({ language: "en", wordCount: 10, complexity: "easy", include: [..."abcd012345678"] });
    expect(raceTextRefusal({ settings, words: custom(["ab", "ac", "ad", "bc", "bd", "cd", "aaaa"]) }, criteria)).toBe("INCLUDED_CHARACTERS_DO_NOT_FIT");
  });

  it("ends without a text, and without a proof, when no cover fits the slots", () => {
    // Each word holds "a" and two of b to i: three words never hold all nine letters, yet no count shows it.
    const triples = [..."bcdefghi"].flatMap((first, index, all) => all.slice(index + 1).map((second) => `a${first}${second}`));
    const criteria = { ...COMPLEXITY_CRITERIA, easy: { ...COMPLEXITY_CRITERIA.easy, maxNumber: 9 } };
    const settings = randomSettings({ language: "en", wordCount: 10, complexity: "easy", include: [..."abcdefghi0123456"] });
    expect(raceTextRefusal({ settings, words: custom(triples) }, criteria)).toBeUndefined();
    for (const state of STATES.slice(0, 5)) {
      expect(generateRaceText({ settings, words: custom(triples), state, criteria })).toEqual({ ok: false, reason: "TEXT_SEARCH_EXHAUSTED" });
    }
    // One digit fewer frees a fourth slot, and a text exists.
    expect(generateRaceText({ settings: { ...settings, include: [..."abcdefghi012345"] }, words: custom(triples), state: STATES[0] as RandomState, criteria }).ok).toBe(true);
  });

  it("abandons a greedy cover that outgrows the slots and tries others", () => {
    // Greedy starts with "abcd" and needs three words; "abe" and "cdf" hold the six letters in two.
    const criteria = { ...COMPLEXITY_CRITERIA, easy: { ...COMPLEXITY_CRITERIA.easy, maxNumber: 9 } };
    const settings = randomSettings({ language: "en", wordCount: 10, complexity: "easy", include: [..."abcdef01234567"] });
    const words = custom(["abcd", "abe", "cdf"]);
    expect(raceTextRefusal({ settings, words }, criteria)).toBeUndefined();
    const results = STATES.slice(0, 20).map((state) => generateRaceText({ settings, words, state, criteria }));
    expect(results.every((result) => result.ok || result.reason === "TEXT_SEARCH_EXHAUSTED")).toBe(true);
    expect(results.filter((result) => result.ok).length).toBeGreaterThan(10);
  });

  it("refuses a pool whose words may never be neighbours, when numbers cannot separate them", () => {
    const settings = randomSettings({ language: "en", wordCount: 10, options: { ...ALL_ON, numbers: false } });
    expect(raceTextRefusal({ settings, words: custom(["sea", "ship"], [["sea", "ship"]]) })).toBe("FORBIDDEN_PAIRS_UNAVOIDABLE");
  });

  it("proves the case where an included letter is held only by a word that may neighbour none", () => {
    // "sea" must appear (the only word with an "e") but may neighbour no word, numbers notwithstanding.
    const words = custom(["sea", "ship", "map"], [["sea", "ship"], ["sea", "map"]]);
    const settings = randomSettings({ language: "en", wordCount: 10, include: ["e"] });
    expect(raceTextRefusal({ settings, words })).toBe("FORBIDDEN_PAIRS_UNAVOIDABLE");
  });

  it("says when the bounded search ends without a text, without claiming a proof", () => {
    // "zz" holds the only "z" and may neighbour one word among 5,000: a text exists, the bounded draws rarely meet it.
    const letter = (value: number): string => String.fromCharCode(97 + (value % 25));
    const others = Array.from({ length: 5_000 }, (_, index) => `w${letter(index)}${letter(Math.floor(index / 25))}${letter(Math.floor(index / 625))}`);
    const words: RandomWords = {
      list: { language: "en", version: "custom", entries: ["zz", ...others].map((word) => ({ word, zipf: 5 })) },
      exclusions: { language: "en", version: "custom", words: [] },
      pairs: { language: "en", version: "custom", pairs: others.slice(1).map((other): [string, string] => ["zz", other]) },
    };
    const settings = randomSettings({ language: "en", wordCount: 10, include: ["z"], options: { ...ALL_ON, numbers: false } });
    expect(raceTextRefusal({ settings, words })).toBeUndefined();
    const reasons = STATES.slice(0, 30).map((state) => {
      const result = generateRaceText({ settings, words, state });
      return result.ok ? "ok" : result.reason;
    });
    expect(reasons.every((reason) => reason === "ok" || reason === "TEXT_SEARCH_EXHAUSTED")).toBe(true);
    expect(reasons).toContain("TEXT_SEARCH_EXHAUSTED");
  });

  it("refuses a coherent request no passage can serve", () => {
    expect(raceTextRefusal({ settings: coherentSettings({ wordCount: 200 }), passages: TEST_PASSAGES.filter((passage) => passage.id !== "fr-test-medium") })).toBe("NO_COMPATIBLE_PASSAGE");
  });

  it("agrees with the generator over seeded random settings", () => {
    const fuzz = createRandom(STATES[7] as RandomState);
    const pick = <T>(items: readonly T[]): T => items[fuzz.index(items.length)] as T;
    for (let round = 0; round < 300; round += 1) {
      const language = pick(["fr", "en"] as const);
      const characters = [..."aeiostzwkq0123456789.,?!;:\"()"];
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
    ["a word outside the list", "Star map sea star zest 12 wave map star moon.", "words from the list"],
    ["a number opening a sentence", "Star map sea. 12 zest star wave map star wave.", "a word at each sentence start"],
    ["an excluded character", "Star map sea star zest 12 wave map star wave. k", "excluded"],
    ["a missing included character", "Star map sea star wave 12 wave map star wave.", "every included"],
    ["a word twice in a row", "Star map sea star zest 12 wave wave star map.", "twice"],
    ["a forbidden pair", "Star map sea ship zest 12 wave map star wave.", "forbidden pair"],
    ["no number", "Star map sea star zest wave map star wave sea.", "at least one number"],
    ["a leading zero", "Star map sea star zest 012 wave map star wave.", "without a leading zero"],
    ["no mark", "Star map sea star zest 12 wave map star wave", "at least one mark"],
    ["a mark outside the set", "Star map sea star zest 12 wave map star wave;", "available set"],
    ["a lowercase sentence start", "Star map sea. star zest 12 wave map star wave.", "capital"],
  ])("reports %s", (_label, text, rule) => {
    expect(raceTextViolations(text, { settings, words }).some((violation) => violation.includes(rule))).toBe(true);
  });

  it("reports what each option off forbids", () => {
    const off = { ...settings, include: [], exclude: [], options: { punctuation: false, numbers: false, capitals: false, accents: false } };
    const violations = raceTextViolations("Star map sea star zest 12 wave map star wave.", { settings: off, words });
    expect(violations).toEqual(expect.arrayContaining([expect.stringContaining("no digit"), expect.stringContaining("no mark"), expect.stringContaining("no capital"), expect.stringContaining("numbers up to")]));
    const french: CoherentTextSettings = { kind: "coherent", language: "fr", wordCount: 10, complexity: "easy", options: off.options };
    expect(raceTextViolations("la mer est très calme et le vent souffle fort", { settings: french, passages: [] })).toEqual([expect.stringContaining("no diacritic")]);
  });
});

describe("review findings, kept as regressions", () => {
  it("brings the opening parenthesis along when only the closing one is included", () => {
    for (const complexity of ["easy", "medium"] as const) {
      for (const state of STATES.slice(0, 20)) {
        const result = text(generateRaceText({ settings: randomSettings({ complexity, wordCount: 20, include: [")"] }), words: WORDS.fr, state }));
        expect(result).toMatch(/\([^ ()]+\)/u);
      }
    }
    expect(text(generateRaceText({ settings: randomSettings({ complexity: "easy", include: [")"], exclude: [".", ","] }), words: WORDS.fr, state: STATES[0] as RandomState }))).toMatch(/\(/u);
  });

  it("treats words spelled differently as different words, even when they fold alike (la, là)", () => {
    const words: RandomWords = { list: wordList("fr", ["la", "là", "mer", "ou", "où", "sur", "sûr"]), exclusions: { language: "fr", version: "custom", words: [] }, pairs: { language: "fr", version: "custom", pairs: [] } };
    for (const state of STATES.slice(0, 100)) {
      expect(generateRaceText({ settings: randomSettings({ wordCount: 50, options: { ...ALL_ON, numbers: false } }), words, state }).ok).toBe(true);
    }
    const two: RandomWords = { ...words, list: wordList("fr", ["la", "là"]) };
    const tokens = tokensOf(text(generateRaceText({ settings: randomSettings({ wordCount: 10, options: { punctuation: false, numbers: false, capitals: false, accents: true } }), words: two, state: STATES[0] as RandomState })));
    expect(tokens.every((token, index) => index === 0 || token !== tokens[index - 1])).toBe(true);
  });

  it("alternates the two words of a two-word pool, never repeating one", () => {
    const result = text(generateRaceText({ settings: randomSettings({ language: "en", wordCount: 10, options: { punctuation: false, numbers: false, capitals: false, accents: true } }), words: custom(["sea", "map"]), state: STATES[2] as RandomState }));
    expect(["sea map sea map sea map sea map sea map", "map sea map sea map sea map sea map sea"]).toContain(result);
  });

  it("keeps a forced cover word away from its forbidden partner, numbers between them included", () => {
    const words = custom(["sea", "ship", "map", "star"], [["sea", "ship"]]);
    for (const state of STATES.slice(0, 50)) {
      const tokens = tokensOf(text(generateRaceText({ settings: randomSettings({ language: "en", wordCount: 20, include: ["e"], options: { punctuation: false, numbers: true, capitals: false, accents: true } }), words, state })));
      const sequence = tokens.filter((token) => !/^\d+$/u.test(token));
      expect(sequence).toContain("sea");
      expect(sequence.some((word, index) => index > 0 && [word, sequence[index - 1]].sort().join(" ") === "sea ship")).toBe(false);
    }
  });

  it("redraws the cover when the greedy one cannot be placed", () => {
    // "dia" covers both letters but may neighbour nothing; "ba" and "dc" together can alternate.
    const words = custom(["dia", "ba", "dc"], [["dia", "ba"], ["dia", "dc"]]);
    const settings = randomSettings({ language: "en", wordCount: 10, complexity: "hard", include: ["a", "d"], options: { ...ALL_ON, numbers: false } });
    for (const state of STATES.slice(0, 20)) {
      expect(generateRaceText({ settings, words, state }).ok).toBe(true);
    }
  });

  it("falls back from a greedy cover that rarely fits to words that fit anywhere", () => {
    // "ab" covers both letters but may neighbour one word among 5,000; "aq" and "bq" fit anywhere.
    const letter = (value: number): string => String.fromCharCode(99 + (value % 20));
    const others = Array.from({ length: 5_000 }, (_, index) => `x${letter(index)}${letter(Math.floor(index / 20))}${letter(Math.floor(index / 400))}`);
    const words: RandomWords = {
      list: { language: "en", version: "custom", entries: ["ab", "aq", "bq", ...others].map((word) => ({ word, zipf: 5 })) },
      exclusions: { language: "en", version: "custom", words: [] },
      pairs: { language: "en", version: "custom", pairs: others.slice(1).map((other): [string, string] => ["ab", other]) },
    };
    const settings = randomSettings({ language: "en", wordCount: 10, include: ["a", "b"], options: { ...ALL_ON, numbers: false } });
    for (const state of STATES.slice(0, 10)) {
      expect(generateRaceText({ settings, words, state }).ok).toBe(true);
    }
  });

  it("spaces French ; and : when they are included in a hard text", () => {
    for (const state of STATES.slice(0, 20)) {
      const tokens = tokensOf(text(generateRaceText({ settings: randomSettings({ complexity: "hard", include: [";", ":"] }), words: WORDS.fr, state })));
      expect(tokens).toEqual(expect.arrayContaining([";", ":"]));
      expect(tokens.some((token) => /[;:]/u.test(token) && token.length > 1)).toBe(false);
    }
  });

  it("refuses when included digits leave no word slot, with injected criteria", () => {
    const criteria = { ...COMPLEXITY_CRITERIA, easy: { ...COMPLEXITY_CRITERIA.easy, maxNumber: 9 } };
    const settings = randomSettings({ complexity: "easy", wordCount: 10, include: [..."0123456789"] });
    expect(raceTextRefusal({ settings, words: WORDS.fr }, criteria)).toBe("INCLUDED_CHARACTERS_DO_NOT_FIT");
  });

  it("refuses end marks, quotes or parentheses that need more words than the slots, with injected criteria", () => {
    // One-digit numbers: each included digit takes a token, and the words left cannot hold the marks.
    const criteria = { ...COMPLEXITY_CRITERIA, easy: { ...COMPLEXITY_CRITERIA.easy, maxNumber: 9 } };
    const ends = (digits: string): RandomTextSettings => randomSettings({ complexity: "easy", wordCount: 10, include: [...digits, ".", "?", "!"] });
    expect(raceTextRefusal({ settings: ends("01234567"), words: WORDS.fr }, criteria)).toBe("INCLUDED_CHARACTERS_DO_NOT_FIT");
    const wrapped = (digits: string): RandomTextSettings => randomSettings({ complexity: "easy", wordCount: 10, include: [...digits, '"', ")"] });
    expect(raceTextRefusal({ settings: wrapped("012345678"), words: WORDS.fr }, criteria)).toBe("INCLUDED_CHARACTERS_DO_NOT_FIT");
    for (const state of STATES.slice(0, 20)) {
      expect(text(generateRaceText({ settings: ends("0123456"), words: WORDS.fr, state, criteria }))).toMatch(/^(?=.*\.)(?=.*\?)(?=.*!)/u);
      expect(text(generateRaceText({ settings: wrapped("01234567"), words: WORDS.fr, state, criteria }))).toMatch(/^(?=.*")(?=.*\()/u);
    }
  });

  it("throws on criteria or settings only a bug can produce", () => {
    const criteria = { ...COMPLEXITY_CRITERIA, easy: { ...COMPLEXITY_CRITERIA.easy, sentenceTokens: [0, 0] as const } };
    expect(() => raceTextRefusal({ settings: randomSettings({ complexity: "easy" }), words: WORDS.fr }, criteria)).toThrow(RangeError);
    expect(() => raceTextRefusal({ settings: randomSettings({ include: Array.from({ length: 101 }, () => "a") }), words: WORDS.fr })).toThrow(RangeError);
  });

});

describe("raceTextViolations: checks added after the reviews", () => {
  const words = custom(["sea", "ship", "map", "star", "zest", "wave", "bad"], [["sea", "ship"]]);
  const settings = randomSettings({ language: "en", wordCount: 10, options: ALL_ON, include: [], exclude: [] });
  const sources = { settings, words: { ...words, exclusions: { language: "en" as const, version: "custom", words: ["bad"] } } };

  it.each([
    ["an excluded word", "Star map sea bad zest 12 wave map star wave.", "no excluded word"],
    ["a capital away from a sentence start", "Star Map sea star zest 12 wave map star wave.", "capitals only at sentence starts"],
    ["a forbidden pair across a number", "Star map sea 12 ship zest wave map star wave.", "forbidden pair"],
    ["an English mark standing alone", "Star map sea star zest 12 wave map star wave !", "no space before"],
    ["a parenthesis left open", "Star (map sea star zest 12 wave map star wave.", "in pairs"],
    ["a parenthesis closed first", "Star map) sea (star zest 12 wave map star wave.", "in pairs"],
    ["a lone quote", 'Star "map sea star zest 12 wave map star wave.', "in pairs"],
  ])("reports %s", (_label, candidate, rule) => {
    expect(raceTextViolations(candidate, sources).some((violation) => violation.includes(rule))).toBe(true);
  });

  it("never names a word of the text, and reports each rule once", () => {
    const violations = raceTextViolations("Star bad sea bad zest 12 moon map star wave.", sources);
    expect(violations).toEqual(expect.arrayContaining(["no excluded word", expect.stringContaining("words from the list")]));
    expect(violations.filter((violation) => violation === "no excluded word")).toHaveLength(1);
    for (const word of ["bad", "moon", "zest"]) expect(violations.join(" ").toLowerCase()).not.toContain(word);
  });

  it("reports a French high mark attached to its word", () => {
    const french = randomSettings({ wordCount: 3, options: ALL_ON });
    expect(raceTextViolations("Mer port; vent.", { settings: french, words: WORDS.fr }).some((violation) => violation.includes("a space before"))).toBe(true);
  });
});
