import { describe, expect, expectTypeOf, it } from "vitest";
import { availableMarks, COMPLEXITY_CRITERIA, settingCharacter, textSettingsRefusal, type CoherentTextSettings, type RandomTextSettings } from "./settings";

const options = { punctuation: true, numbers: true, capitals: true, accents: true };
const random = (overrides: Partial<RandomTextSettings> = {}): RandomTextSettings => ({
  kind: "random",
  language: "fr",
  wordCount: 50,
  complexity: "medium",
  options,
  include: [],
  exclude: [],
  ...overrides,
});
const coherent = (overrides: Partial<CoherentTextSettings> = {}): CoherentTextSettings => ({ kind: "coherent", language: "en", wordCount: 50, complexity: "easy", options, ...overrides });

describe("textSettingsRefusal", () => {
  it.each([10, 50, 200])("accepts %i words", (wordCount) => {
    expect(textSettingsRefusal(random({ wordCount }))).toBeUndefined();
    expect(textSettingsRefusal(coherent({ wordCount }))).toBeUndefined();
  });

  it.each([9, 201, 10.5, Number.NaN, -1])("refuses %s words", (wordCount) => {
    expect(textSettingsRefusal(random({ wordCount }))).toBe("WORD_COUNT_OUT_OF_RANGE");
    expect(textSettingsRefusal(coherent({ wordCount }))).toBe("WORD_COUNT_OUT_OF_RANGE");
  });

  it.each([
    ["an accented letter in English", { language: "en" as const, include: ["é"] }],
    ["ß in French", { include: ["ß"] }],
    ["two graphemes", { include: ["ab"] }],
    ["a space", { exclude: [" "] }],
    ["an emoji", { include: ["🙂"] }],
    ["œ, avoided in random mode for now", { include: ["œ"] }],
    ["an apostrophe, which is spelling", { exclude: ["'"] }],
  ])("refuses %s as UNSUPPORTED_CHARACTER", (_label, overrides) => {
    expect(textSettingsRefusal(random(overrides))).toBe("UNSUPPORTED_CHARACTER");
  });

  it("compares characters case-insensitively and pairs the parentheses", () => {
    expect(textSettingsRefusal(random({ include: ["A"], exclude: ["a"] }))).toBe("CHARACTER_INCLUDED_AND_EXCLUDED");
    expect(textSettingsRefusal(random({ complexity: "hard", include: ["("], exclude: [")"] }))).toBe("CHARACTER_INCLUDED_AND_EXCLUDED");
    expect(textSettingsRefusal(random({ include: ["É"], exclude: ["e"] }))).toBeUndefined();
  });

  it.each([
    ["a digit with numbers off", { include: ["7"], options: { ...options, numbers: false } }],
    ["a mark with punctuation off", { include: ["?"], options: { ...options, punctuation: false } }],
    ["an accented letter with accents off", { include: ["é"], options: { ...options, accents: false } }],
  ])("refuses %s as INCLUDED_CHARACTER_DISABLED", (_label, overrides) => {
    expect(textSettingsRefusal(random(overrides))).toBe("INCLUDED_CHARACTER_DISABLED");
  });

  it("refuses an option whose characters are all excluded", () => {
    expect(textSettingsRefusal(random({ exclude: [..."0123456789"] }))).toBe("OPTION_FULLY_EXCLUDED");
    expect(textSettingsRefusal(random({ complexity: "easy", exclude: [".", ","] }))).toBe("OPTION_FULLY_EXCLUDED");
    expect(textSettingsRefusal(random({ complexity: "easy", exclude: [".", ","], include: ["!"] }))).toBeUndefined();
    expect(textSettingsRefusal(random({ exclude: [..."0123456789"], options: { ...options, numbers: false } }))).toBeUndefined();
  });

  it("returns the first refusal in priority order", () => {
    expect(textSettingsRefusal(random({ wordCount: 9, include: ["ß"] }))).toBe("WORD_COUNT_OUT_OF_RANGE");
    expect(textSettingsRefusal(random({ include: ["ß", "a"], exclude: ["a"] }))).toBe("UNSUPPORTED_CHARACTER");
    expect(textSettingsRefusal(random({ include: ["a", "7"], exclude: ["a"], options: { ...options, numbers: false } }))).toBe("CHARACTER_INCLUDED_AND_EXCLUDED");
    expect(textSettingsRefusal(random({ include: ["?"], exclude: [..."0123456789"], options: { ...options, punctuation: false } }))).toBe("INCLUDED_CHARACTER_DISABLED");
  });

  it("never refuses coherent settings for characters, which they cannot even express", () => {
    expectTypeOf<CoherentTextSettings>().not.toHaveProperty("include");
    expectTypeOf<CoherentTextSettings>().not.toHaveProperty("exclude");
    expect(textSettingsRefusal(coherent({ options: { punctuation: false, numbers: false, capitals: false, accents: false } }))).toBeUndefined();
  });

  it("throws on values only a bug can produce", () => {
    expect(() => textSettingsRefusal({ ...random(), complexity: "extreme" } as unknown as RandomTextSettings)).toThrow(RangeError);
    const oneTokenSentences = { ...COMPLEXITY_CRITERIA, easy: { ...COMPLEXITY_CRITERIA.easy, sentenceTokens: [1, 4] as const } };
    expect(() => textSettingsRefusal(random(), oneTokenSentences)).toThrow(RangeError);
    const halfPair = { ...COMPLEXITY_CRITERIA, hard: { ...COMPLEXITY_CRITERIA.hard, marks: [".", "("] as const } };
    expect(() => textSettingsRefusal(random(), halfPair)).toThrow(RangeError);
    expect(() => textSettingsRefusal({ ...coherent(), language: "es" } as unknown as CoherentTextSettings)).toThrow(RangeError);
  });
});

describe("settingCharacter and availableMarks", () => {
  it("lowercases one supported character and rejects the rest", () => {
    expect(settingCharacter("É", "fr")).toBe("é");
    expect(settingCharacter("é", "en")).toBeUndefined();
    expect(settingCharacter(";", "en")).toBe(";");
    expect(settingCharacter("e".repeat(100_000), "fr")).toBeUndefined();
    expect(settingCharacter(`e${String.fromCodePoint(0x301).repeat(40)}`, "fr")).toBeUndefined();
  });

  it("adds included marks to the complexity's and removes excluded ones, with their partner", () => {
    expect(availableMarks(random({ complexity: "easy", include: ["?"] }), COMPLEXITY_CRITERIA.easy)).toEqual([".", ",", "?"]);
    expect(availableMarks(random({ complexity: "hard", exclude: ["("] }), COMPLEXITY_CRITERIA.hard)).toEqual([".", ",", "?", "!", ";", ":", '"']);
  });
});
