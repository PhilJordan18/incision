import { describe, expect, it } from "vitest";
import { availableBonusGrants, createBonusRace, reduceBonusRace } from "../bonuses/coordinator";
import type { BonusContent, BonusRaceEvent, BonusRaceState } from "../bonuses/coordinator-types";
import { asEntrantId, asRaceId } from "../ids";
import { MAX_TEXT_GRAPHEMES } from "../race/limits";
import type { InputEvent } from "../race/types";
import { createRandom, type RandomState } from "../random/prng";
import { asInstant } from "../time";
import {
  drawExtensionWords,
  EXTENSION_MIX_VERSION,
  extensionJunction,
  extensionKey,
  extensionState,
  extensionViolations,
  type ExtensionInput,
  type ExtensionSettings,
} from "./extension";
import type { RandomWords } from "./random";
import { COMPLEXITIES, type TextOptions } from "./settings";
import { EN_TEST_EXCLUSIONS, EN_TEST_LIST, EN_TEST_PAIRS, FR_TEST_EXCLUSIONS, FR_TEST_LIST, FR_TEST_PAIRS } from "./text.fixtures";
import { isWordToken } from "./words";

const WORDS: Readonly<Record<"fr" | "en", RandomWords>> = {
  fr: { list: FR_TEST_LIST, exclusions: FR_TEST_EXCLUSIONS, pairs: FR_TEST_PAIRS },
  en: { list: EN_TEST_LIST, exclusions: EN_TEST_EXCLUSIONS, pairs: EN_TEST_PAIRS },
};
const ALL_ON: TextOptions = { punctuation: true, numbers: true, capitals: true, accents: true };
const OPTION_SETS: readonly TextOptions[] = Array.from({ length: 16 }, (_, bits) => ({ punctuation: (bits & 1) > 0, numbers: (bits & 2) > 0, capitals: (bits & 4) > 0, accents: (bits & 8) > 0 }));
const SEED: RandomState = [1, 2, 3, 4];
/** The pinned draw for the FR fixtures, SEED, the test grant and "la mer est calme" (EXTENSION_DRAW_VERSION 1). */
const GOLDEN_TRIPLE = ["la", "tempête", "jetée"];
/** Successes of the needle search over seeds 1 to 40 (EXTENSION_DRAWS_PER_SLOT 64, EXTENSION_RESTARTS 4). */
const PINNED_NEEDLE_SUCCESSES = 34;
const grant = { raceId: asRaceId("race-1"), entrantId: asEntrantId("alice"), milestone: 25 } as const;
const settings = (overrides: Partial<ExtensionSettings> = {}): ExtensionSettings => ({ language: "fr", complexity: "medium", options: ALL_ON, ...overrides });
const input = (overrides: Partial<ExtensionInput> = {}): ExtensionInput => ({ settings: settings(), words: WORDS.fr, target: "la mer est calme", seed: SEED, grant, ...overrides });
const custom = (language: "fr" | "en", words: readonly string[], pairs: readonly (readonly [string, string])[] = [], version = "custom"): RandomWords => ({
  list: { language, version, entries: words.map((word, index) => ({ word, zipf: 6 - index / 100 })) },
  exclusions: { language, version, words: [] },
  pairs: { language, version, pairs },
});
const words = (draw: ReturnType<typeof drawExtensionWords>): readonly string[] => {
  if (!draw.ok) throw new Error(`refused: ${draw.reason}`);
  return draw.words;
};

describe("extension key and mix: pinned, versioned, independent of other draws", () => {
  it("encodes the grant identity without ambiguity", () => {
    expect(EXTENSION_MIX_VERSION).toBe(1);
    expect(extensionKey(grant)).toBe("incision-extension-mix/1|race-1|alice|25");
  });

  it("derives pinned states, checked against an independent implementation", () => {
    // Golden values, recomputed from the documented algorithm by a separate Python script (October 21).
    expect(extensionState(SEED, grant)).toEqual([164993275, 2808317430, 2954367516, 910347073]);
    expect(extensionState([0x9e3779b9, 0x7f4a7c15, 0x2545f491, 1], { ...grant, milestone: 75 })).toEqual([3759272918, 3263084317, 2876276686, 2145778103]);
  });

  it("makes every word of the state depend on the whole seed", () => {
    // Seeds that differ in one word only still change every word of the state, and the first draw.
    for (let word = 0; word < 4; word += 1) {
      const changed = [1, 2, 3, 4].map((value, index) => (index === word ? value + 1 : value)) as unknown as RandomState;
      const [before, after] = [extensionState(SEED, grant), extensionState(changed, grant)];
      expect(before.every((value, index) => value !== after[index])).toBe(true);
    }
    const firsts = Array.from({ length: 20 }, (_, seed) => words(drawExtensionWords(input({ seed: [seed + 1, 7, 7, 7] })))[0]);
    expect(new Set(firsts).size).toBeGreaterThan(3);
  });

  it("refuses the identities and seeds only a bug can produce", () => {
    expect(() => extensionKey({ ...grant, raceId: "race|1" as never })).toThrow(RangeError);
    expect(() => extensionKey({ ...grant, milestone: 30 as never })).toThrow(RangeError);
    expect(() => extensionState([0, 0, 0, 0], grant)).toThrow(RangeError);
  });
});

describe("drawExtensionWords: determinism", () => {
  it("gives the same words for identical inputs and never touches the seed", () => {
    const seed = Object.freeze([7, 11, 13, 17]) as unknown as RandomState;
    expect(drawExtensionWords(input({ seed }))).toEqual(drawExtensionWords(input({ seed })));
    expect(seed).toEqual([7, 11, 13, 17]);
  });

  it("draws independently for another milestone, owner or race, without a shared stream", () => {
    const draws = [25, 50, 75].flatMap((milestone) => ["alice", "bob"].map((owner) => JSON.stringify(words(drawExtensionWords(input({ grant: { ...grant, milestone: milestone as 25, entrantId: asEntrantId(owner) } }))))));
    expect(new Set(draws).size).toBeGreaterThan(3);
    // An unrelated draw in between changes nothing: no stream is shared.
    const first = drawExtensionWords(input());
    drawExtensionWords(input({ grant: { ...grant, milestone: 50 } }));
    expect(drawExtensionWords(input())).toEqual(first);
  });
});

describe("drawExtensionWords: every mandatory control, over options, languages and complexities", () => {
  it("keeps every rule on the result, checked against the list itself", () => {
    const fuzz = createRandom([0x1234_5678, 0x9abc_def0, 0x0fed_cba9, 0x8765_4321]);
    const targets = { fr: ["la mer est calme", "Le vent souffle sur le port.", "Il cria : « mer ! »", "la mer 12", "Quelle nuit ?"], en: ["the sea is calm", "The wind blows.", "the map 12", "Who is there?\""] } as const;
    let drawn = 0;
    for (const language of ["fr", "en"] as const) {
      for (const complexity of COMPLEXITIES) {
        for (const options of OPTION_SETS) {
          for (const target of targets[language]) {
            const seed = [fuzz.uint32(), fuzz.uint32(), fuzz.uint32(), (fuzz.uint32() | 1) >>> 0] as RandomState;
            const request = input({ settings: settings({ language, complexity, options }), words: WORDS[language], target, seed });
            const draw = drawExtensionWords(request);
            if (!draw.ok) {
              expect(draw.reason).toBe("NO_COMPATIBLE_WORDS");
              continue;
            }
            drawn += 1;
            expect({ target, options, violations: extensionViolations(request, draw.words) }).toEqual({ target, options, violations: [] });
            // The coordinator's extend effect accepts the syntax: word tokens, NFC, no space.
            expect(draw.words.every((word) => isWordToken(word) && word === word.normalize("NFC") && !word.includes(" "))).toBe(true);
          }
        }
      }
    }
    expect(drawn).toBeGreaterThan(300);
  });

  it("never draws an excluded word or character, a diacritic with accents off, or œ and æ", () => {
    for (let milestone = 0; milestone < 30; milestone += 1) {
      const seed = [milestone + 1, 5, 9, 13] as RandomState;
      expect(words(drawExtensionWords(input({ seed, settings: settings({ complexity: "easy", exclude: ["e"] }) }))).join(" ")).not.toMatch(/e/u);
      expect(words(drawExtensionWords(input({ seed, settings: settings({ options: { ...ALL_ON, accents: false } }) }))).join(" ")).toMatch(/^[a-zA-Z' ]+$/u);
      expect(words(drawExtensionWords(input({ seed, settings: settings({ complexity: "hard" }) }))).join(" ")).not.toMatch(/[œæ]|motinterdit/u);
    }
  });
});

describe("extensionViolations: an independent check of a triple", () => {
  const pool = custom("fr", ["mer", "vent", "port", "nuit"], [["mer", "port"]]);
  const request = input({ words: pool, target: "Il dort." });

  it("passes a valid triple and names each broken rule, never a word", () => {
    expect(extensionViolations(request, ["Vent", "nuit", "mer"])).toEqual([]);
    expect(extensionViolations(request, ["Vent", "nuit"])).toEqual(["exactly three words"]);
    expect(extensionViolations(request, ["Vent", "nuit", "soleil"])).toEqual(["words from the list, at Zipf 3.3 or more"]);
    // A band the draw would never produce is caught by the list itself: 10 letters in an easy race.
    const easy = { ...request, words: custom("fr", ["mer", "vent", "port", "scaphandre"]), settings: settings({ complexity: "easy" }) };
    expect(extensionViolations(easy, ["Vent", "scaphandre", "mer"])).toEqual(["words of at most 5 letters"]);
    expect(extensionViolations({ ...request, words: { ...pool, exclusions: { language: "fr", version: "custom", words: ["nuit"] } } }, ["Vent", "nuit", "mer"])).toEqual(["no excluded word"]);
    expect(extensionViolations({ ...request, settings: settings({ exclude: ["v"] }) }, ["Vent", "nuit", "mer"])).toEqual(["words of allowed letters only"]);
    expect(extensionViolations(request, ["vent", "nuit", "mer"])).toEqual(["a capital on the first word only after a sentence end, with capitals on"]);
    expect(extensionViolations(request, ["Vent", "Nuit", "mer"])).toEqual(["a capital on the first word only after a sentence end, with capitals on"]);
    expect(extensionViolations(request, ["Vent", "vent", "mer"])).toEqual(["no word next to the same word"]);
    expect(extensionViolations(request, ["Vent", "mer", "port"])).toEqual(["no forbidden pair side by side"]);
    expect(extensionViolations({ ...request, target: "la mer 12" }, ["port", "nuit", "vent"])).toEqual(["no forbidden pair side by side"]);
    const full = input({ words: pool, target: `${"mer ".repeat(Math.floor((MAX_TEXT_GRAPHEMES - 8) / 4))}mer` });
    expect(extensionViolations(full, ["vent", "nuit", "port"])).toContain("the text stays within MAX_TEXT_GRAPHEMES");
  });
});

describe("drawExtensionWords: the junction with the target", () => {
  it("never puts a forbidden pair or the same word next to the target's last word, numbers transparent", () => {
    const pool = custom("fr", ["mer", "port", "vent"], [["mer", "port"]]);
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const target of ["la mer", "la mer 12", "la mer 3 4", "la mer 3,5", "la mer 10:30", "la mer 1914-1918"]) {
        const [first] = words(drawExtensionWords(input({ words: pool, target, seed: [seed, 2, 3, 4] })));
        expect(["mer", "port"]).not.toContain(first);
      }
    }
  });

  it("never repeats a neighbour, between the three words too", () => {
    const two = custom("en", ["sea", "map"]);
    expect(words(drawExtensionWords(input({ settings: settings({ language: "en" }), words: two, target: "the sea" })))).toEqual(["map", "sea", "map"]);
  });

  it("puts a capital on the first word only after a sentence end, with capitals on", () => {
    const pool = custom("fr", ["mer", "vent", "port", "été"]);
    const capitalised = (target: string, options: TextOptions = ALL_ON) => words(drawExtensionWords(input({ words: pool, target, settings: settings({ options }) })));
    for (const target of ["Il dort.", "Viens !", "Qui ?", 'Il dit "oui."', "(fin.)"]) {
      const [first, ...rest] = capitalised(target);
      expect(first?.charAt(0)).toBe(first?.charAt(0).toUpperCase());
      expect(rest.every((word) => word === word.toLowerCase())).toBe(true);
    }
    for (const target of ["il dort", "il dort,", "la mer 12"]) {
      expect(capitalised(target).every((word) => word === word.toLowerCase())).toBe(true);
    }
    expect(capitalised("Il dort.", { ...ALL_ON, capitals: false }).every((word) => word === word.toLowerCase())).toBe(true);
    // With punctuation off, sentence ends are invisible: no capital, even after a stray mark.
    expect(capitalised("Il dort.", { ...ALL_ON, punctuation: false }).every((word) => word === word.toLowerCase())).toBe(true);
    expect(extensionJunction("Il dort.")).toEqual({ lastWord: "dort", sentenceEnd: true });
  });
});

describe("drawExtensionWords: pinned output and the exact room", () => {
  it("pins one draw, so changing the algorithm without EXTENSION_DRAW_VERSION shows", () => {
    expect(words(drawExtensionWords(input()))).toEqual(GOLDEN_TRIPLE);
  });

  it("never lets a longer word take the space the next words need", () => {
    // 9 graphemes of room: only three 2-letter words fit; "efg" would push the text to 4,001.
    const pool = custom("fr", ["ab", "cd", "efg"]);
    const fits = `${"mer ".repeat(997)}mer`;
    for (let seed = 1; seed <= 30; seed += 1) {
      const drawn = words(drawExtensionWords(input({ words: pool, target: fits, seed: [seed, seed + 1, 3, 4] })));
      expect(`${fits} ${drawn.join(" ")}`.length).toBe(MAX_TEXT_GRAPHEMES);
    }
  });

  it("pins how often the bounded search succeeds when only one word fits the junction", () => {
    // Every word but "zz" forms a forbidden pair with "sea": about one draw in a hundred fits the
    // first slot. The pinned count changes with EXTENSION_DRAWS_PER_SLOT or EXTENSION_RESTARTS.
    const letter = (value: number): string => String.fromCharCode(97 + (value % 26));
    const others = Array.from({ length: 100 }, (_, index) => `w${letter(index)}${letter(Math.floor(index / 26))}`);
    const pool = custom("en", ["zz", ...others], others.map((other): [string, string] => ["sea", other]));
    let succeeded = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const draw = drawExtensionWords(input({ settings: settings({ language: "en" }), words: pool, target: "the sea", seed: [seed, 3, 5, 7] }));
      if (draw.ok) {
        succeeded += 1;
        expect(draw.words[0]).toBe("zz");
      } else {
        expect(draw.reason).toBe("EXTENSION_SEARCH_EXHAUSTED");
      }
    }
    expect(succeeded).toBe(PINNED_NEEDLE_SUCCESSES);
  });

  it("fills the room to exactly MAX_TEXT_GRAPHEMES, and refuses one grapheme more", () => {
    const pool = custom("fr", ["ab", "cd", "ef"]);
    // 997 × "mer " then "mer": 3,991 graphemes, so three 2-letter words and their spaces make 4,000.
    const fits = `${"mer ".repeat(997)}mer`;
    expect(fits.length).toBe(MAX_TEXT_GRAPHEMES - 9);
    const drawn = words(drawExtensionWords(input({ words: pool, target: fits })));
    expect(`${fits} ${drawn.join(" ")}`.length).toBe(MAX_TEXT_GRAPHEMES);
    expect(extensionViolations(input({ words: pool, target: fits }), drawn)).toEqual([]);
    const tooLong = `${fits}s`;
    expect(drawExtensionWords(input({ words: pool, target: tooLong }))).toEqual({ ok: false, reason: "NO_ROOM" });
    expect(extensionViolations(input({ words: pool, target: tooLong }), drawn)).toEqual(["the text stays within MAX_TEXT_GRAPHEMES"]);
  });
});

describe("drawExtensionWords: refusals, proofs before the bounded search", () => {
  it("refuses the shipped fixtures unless a test allows them, whichever file is a fixture, before any other check", () => {
    const shipped = custom("fr", ["mer", "vent", "port"], [], "fixture-1");
    expect(drawExtensionWords(input({ words: shipped }))).toEqual({ ok: false, reason: "FIXTURE_DATA" });
    expect(drawExtensionWords(input({ words: shipped, allowFixtureData: true })).ok).toBe(true);
    const real = custom("fr", ["mer", "vent", "port"]);
    expect(drawExtensionWords(input({ words: { ...real, pairs: { ...real.pairs, version: "fixture-1" } } }))).toEqual({ ok: false, reason: "FIXTURE_DATA" });
    expect(drawExtensionWords(input({ words: { ...real, exclusions: { ...real.exclusions, version: "fixture-2" } } }))).toEqual({ ok: false, reason: "FIXTURE_DATA" });
    // Fixture data are refused first, even when the pool would be empty.
    expect(drawExtensionWords(input({ words: shipped, settings: settings({ exclude: [..."aeiouy"] }) }))).toEqual({ ok: false, reason: "FIXTURE_DATA" });
  });

  it("throws for a language or complexity only a bug can produce", () => {
    expect(() => drawExtensionWords(input({ settings: settings({ complexity: "extreme" as never }) }))).toThrow(RangeError);
    expect(() => drawExtensionWords(input({ settings: settings({ language: "es" as never }) }))).toThrow(RangeError);
  });

  it("refuses an empty pool and a target with no room left, as proofs", () => {
    expect(drawExtensionWords(input({ settings: settings({ exclude: [..."aeiouyéèêàâîôûù"] }) }))).toEqual({ ok: false, reason: "NO_COMPATIBLE_WORDS" });
    const full = `${"mer ".repeat(Math.floor((MAX_TEXT_GRAPHEMES - 8) / 4))}mer`;
    expect(drawExtensionWords(input({ target: full }))).toEqual({ ok: false, reason: "NO_ROOM" });
  });

  it("keeps the remaining room for the words still to come", () => {
    // 17 graphemes left: "a longword a" fits, "longword a longword" would not.
    const pool = custom("en", ["a", "longword"]);
    const target = `${"sea ".repeat(Math.floor((MAX_TEXT_GRAPHEMES - 20) / 4))}sea`;
    let [long, drawnCount] = [0, 0];
    for (let seed = 1; seed <= 40; seed += 1) {
      const draw = drawExtensionWords(input({ settings: settings({ language: "en", complexity: "hard" }), words: pool, target, seed: [seed, seed * 3, 7, 11] }));
      // A triple starting with "longword" cannot be completed: the bounded search may end without one.
      if (!draw.ok) {
        expect(draw.reason).toBe("EXTENSION_SEARCH_EXHAUSTED");
        continue;
      }
      drawnCount += 1;
      long += draw.words.filter((word) => word === "longword").length;
      expect(`${target} ${draw.words.join(" ")}`.length).toBeLessThanOrEqual(MAX_TEXT_GRAPHEMES);
    }
    expect([drawnCount > 20, long > 0]).toEqual([true, true]);
  });

  it("says when the bounded search ends, without claiming a proof", () => {
    // Every word forms a forbidden pair with "sea": the first slot can never be filled.
    const pool = custom("en", ["sea", "map", "star"], [["sea", "map"], ["sea", "star"]]);
    expect(drawExtensionWords(input({ settings: settings({ language: "en" }), words: pool, target: "the sea" }))).toEqual({ ok: false, reason: "EXTENSION_SEARCH_EXHAUSTED" });
  });
});

describe("drawExtensionWords through the real coordinator", () => {
  const actor = asEntrantId("actor"), leader = asEntrantId("leader"), raceId = asRaceId("race");
  const text = "mer vent port nuit jour ciel eau sud nord cap";
  function ready(): BonusRaceState {
    const created = createBonusRace({ enabled: true, random: [1, 2, 3, 4], race: {
      raceId, now: asInstant(0), text, errorMode: "mandatory", timeLimit: null,
      participants: [{ entrantId: actor, kind: "human" }, { entrantId: leader, kind: "human" }],
    } });
    if (!created.ok) throw new Error(created.reason);
    const step = (state: BonusRaceState, event: BonusRaceEvent) => {
      const result = reduceBonusRace(state, event);
      if (!result.ok) throw new Error(result.reason);
      return result.state;
    };
    let state = step(created.state, { type: "tick", now: asInstant(3000) });
    const entrant = state.race.entrants.find((item) => item.entrantId === leader)!;
    const events: InputEvent[] = entrant.target.slice(0, 22).map((grapheme) => ({ type: "insert", grapheme }));
    state = step(state, { type: "keystrokes", now: asInstant(5000), batch: { raceId, entrantId: leader, seq: 1, textVersion: 0, events } });
    // An explicit grant kind, as the coordinator's own tests do; seeded kinds are tested there.
    return { ...state, awards: { ...state.awards, grants: state.awards.grants.map((item) => ({ ...item, kind: "extendLeader" as const })) } };
  }
  const provider = (data: RandomWords): BonusContent => ({ race, grant: owned, targetId }) => {
    const target = race.entrants.find((item) => item.entrantId === targetId)!.target.join("");
    const draw = drawExtensionWords({ settings: settings(), words: data, target, seed: [9, 8, 7, 6], grant: { raceId: race.raceId, entrantId: owned.entrantId, milestone: owned.milestone } });
    return draw.ok ? draw.words : undefined;
  };
  const activate: BonusRaceEvent = { type: "activate", raceId, entrantId: actor, seq: 1, milestone: 25, now: asInstant(5000) };

  it("leaves the grant available after a content refusal, then extends the leader with the drawn words", () => {
    const state = ready();
    expect(availableBonusGrants(state, actor)).toHaveLength(1);
    const refused = reduceBonusRace(state, activate, provider(custom("fr", ["mer", "vent"], [], "fixture-1")));
    expect(refused).toMatchObject({ ok: true, activation: { ok: false, reason: "CONTENT_UNAVAILABLE" } });
    if (!refused.ok) throw new Error(refused.reason);
    expect(availableBonusGrants(refused.state, actor)).toHaveLength(1);
    const applied = reduceBonusRace(refused.state, { ...activate, seq: 2 }, provider(WORDS.fr));
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.activation).toMatchObject({ ok: true });
    expect(availableBonusGrants(applied.state, actor)).toHaveLength(0);
    const extended = applied.state.race.entrants.find((item) => item.entrantId === leader)!.target.join("");
    const expected = provider(WORDS.fr)({ race: refused.state.race, grant: availableBonusGrants(refused.state, actor)[0]!, targetId: leader })!;
    expect(extended).toBe(`${text} ${expected.join(" ")}`);
  });
});
