import { DEFAULT_TEXT_SETTINGS, initialRoomSettings } from "@incision/database";
import type { RandomWords, TextLanguage } from "@incision/domain";
import { EXCLUSIONS, FORBIDDEN_PAIRS, WORD_LISTS } from "@incision/domain/words";
import { describe, expect, it } from "vitest";
import { approvedRandomWords, roomTextSettings, textSettingsProblem } from "./text-settings";

/** Hand-written words under a non-fixture version: what approved data look like to the server. */
function words(language: TextLanguage, list: readonly string[], excluded: readonly string[] = []): RandomWords {
  const version = "test-approved-1";
  return {
    list: { language, version, entries: list.map((word, index) => ({ word, zipf: 6 - index / 100 })) },
    exclusions: { language, version, words: excluded },
    pairs: { language, version, pairs: [] },
  };
}

const ENGLISH = (language: TextLanguage) => (language === "en" ? words("en", ["sea", "ship", "wind", "sail", "map", "star", "moon", "wave", "kite", "deck", "tide", "mast"]) : undefined);
const room = (overrides: Partial<ReturnType<typeof initialRoomSettings>> = {}) => ({ ...initialRoomSettings("en"), ...overrides });

describe("roomTextSettings", () => {
  it("gives coherent settings no characters at all (D-10), and random settings the saved ones", () => {
    expect(roomTextSettings(room({ includeCharacters: ["k"] }))).toEqual({
      kind: "coherent", language: "en", wordCount: 50, complexity: "medium", options: { punctuation: true, numbers: false, capitals: true, accents: true },
    });
    expect(roomTextSettings(room({ textKind: "random", complexity: "easy", numbers: true, includeCharacters: ["k"], excludeCharacters: ["e"] }))).toEqual({
      kind: "random", language: "en", wordCount: 50, complexity: "easy", options: { punctuation: true, numbers: true, capitals: true, accents: true }, include: ["k"], exclude: ["e"],
    });
  });

  it("maps D-19's stored defaults to the engine's coherent defaults", () => {
    expect(roomTextSettings({ ...initialRoomSettings("fr"), ...DEFAULT_TEXT_SETTINGS })).toMatchObject({ kind: "coherent", complexity: "medium" });
  });
});

describe("approvedRandomWords", () => {
  it.each(["fr", "en"] as const)("serves the shipped %s data only when no part of it is a hand-written fixture", (language) => {
    const versions = [WORD_LISTS[language].version, EXCLUSIONS[language].version, FORBIDDEN_PAIRS[language].version];
    const served = approvedRandomWords(language);
    if (versions.some((version) => version.startsWith("fixture"))) expect(served).toBeUndefined();
    else expect(served?.list).toBe(WORD_LISTS[language]);
  });
});

describe("textSettingsProblem", () => {
  it("lets coherent settings through: only the corpus at the start can refuse them", () => {
    expect(textSettingsProblem(roomTextSettings(room()), () => undefined)).toBeUndefined();
    expect(textSettingsProblem(roomTextSettings(room({ wordCount: 9 })), () => undefined)).toBe("WORD_COUNT_OUT_OF_RANGE");
  });

  it("refuses random settings while no approved list exists, never falling back on fixtures", () => {
    expect(textSettingsProblem(roomTextSettings(room({ textKind: "random" })), () => undefined)).toBe("WORDS_UNAVAILABLE");
  });

  it("names the engine's data-free refusals first, then its proofs on the approved list", () => {
    const random = (overrides: Parameters<typeof room>[0]) => roomTextSettings(room({ textKind: "random", ...overrides }));
    expect(textSettingsProblem(random({ includeCharacters: ["k"], excludeCharacters: ["k"] }), ENGLISH)).toBe("CHARACTER_INCLUDED_AND_EXCLUDED");
    expect(textSettingsProblem(random({ includeCharacters: ["7"] }), ENGLISH)).toBe("INCLUDED_CHARACTER_DISABLED");
    expect(textSettingsProblem(random({ excludeCharacters: [..."aeiouy"] }), ENGLISH)).toBe("NO_COMPATIBLE_WORDS");
    expect(textSettingsProblem(random({ includeCharacters: ["q"] }), ENGLISH)).toBe("INCLUDED_CHARACTER_UNAVAILABLE");
    expect(textSettingsProblem(random({ includeCharacters: ["k"] }), ENGLISH)).toBeUndefined();
    expect(textSettingsProblem(random({}), ENGLISH)).toBeUndefined();
  });
});
