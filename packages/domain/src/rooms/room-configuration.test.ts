import { describe, expect, it } from "vitest";
import { TIME_LIMIT_MAX_MS, TIME_LIMIT_MIN_MS } from "../race/limits";
import type { ErrorMode } from "../race/types";
import type { RandomTextSettings } from "../text/settings";
import type { Duration } from "../time";
import { TEXT_LANGUAGES, type TextLanguage } from "../words/types";
import { defaultRoomConfiguration, defaultTextSettings, roomConfigurationRefusal, type RoomConfiguration } from "./room-configuration";

const limit = (milliseconds: number): Duration => milliseconds as Duration;

function configuration(overrides: Partial<RoomConfiguration> = {}): RoomConfiguration {
  return { ...defaultRoomConfiguration("fr"), ...overrides };
}

function random(overrides: Partial<RandomTextSettings> = {}): RandomTextSettings {
  return { ...defaultTextSettings("fr"), kind: "random", include: [], exclude: [], ...overrides };
}

describe("defaultRoomConfiguration (D-19)", () => {
  it.each(TEXT_LANGUAGES)("is coherent, 50 words, medium, mandatory correction and no time limit, in %s", (language) => {
    expect(defaultRoomConfiguration(language)).toEqual({
      text: {
        kind: "coherent",
        language,
        wordCount: 50,
        complexity: "medium",
        options: { punctuation: true, numbers: false, capitals: true, accents: true },
      },
      errorMode: "mandatory",
      timeLimit: null,
    });
    expect(roomConfigurationRefusal(defaultRoomConfiguration(language))).toBeUndefined();
  });

  it("returns a new value each time, so a caller cannot alter another room's", () => {
    expect(defaultRoomConfiguration("en")).not.toBe(defaultRoomConfiguration("en"));
    expect(defaultRoomConfiguration("en").text.options).not.toBe(defaultRoomConfiguration("en").text.options);
  });
});

describe("roomConfigurationRefusal", () => {
  it.each([null, TIME_LIMIT_MIN_MS, 120_000, TIME_LIMIT_MAX_MS])("accepts a time limit of %s (CONF-01, D-17)", (milliseconds) => {
    expect(roomConfigurationRefusal(configuration({ timeLimit: milliseconds === null ? null : limit(milliseconds) }))).toBeUndefined();
  });

  it.each([0, TIME_LIMIT_MIN_MS - 1, TIME_LIMIT_MAX_MS + 1, 30_000.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses a time limit of %s", (milliseconds) => {
    expect(roomConfigurationRefusal(configuration({ timeLimit: limit(milliseconds) }))).toBe("INVALID_TIME_LIMIT");
  });

  it("accepts both error modes (CONF-08)", () => {
    expect(roomConfigurationRefusal(configuration({ errorMode: "free" }))).toBeUndefined();
    expect(roomConfigurationRefusal(configuration({ errorMode: "mandatory" }))).toBeUndefined();
  });

  it("gives the text settings' refusal (CONF-04, CONF-07)", () => {
    expect(roomConfigurationRefusal(configuration({ text: { ...defaultTextSettings("en"), wordCount: 9 } }))).toBe("WORD_COUNT_OUT_OF_RANGE");
    expect(roomConfigurationRefusal(configuration({ text: random({ include: ["a"], exclude: ["A"] }) }))).toBe("CHARACTER_INCLUDED_AND_EXCLUDED");
    expect(roomConfigurationRefusal(configuration({ text: random({ include: ["z"] }) }))).toBeUndefined();
  });

  it("checks the time limit before the text", () => {
    const text = { ...defaultTextSettings("fr"), wordCount: 201 };
    expect(roomConfigurationRefusal(configuration({ text, timeLimit: limit(1) }))).toBe("INVALID_TIME_LIMIT");
  });

  it("throws for a value only a bug can produce, even with a time limit to refuse", () => {
    expect(() => roomConfigurationRefusal(configuration({ errorMode: "lenient" as ErrorMode, timeLimit: limit(1) }))).toThrow(RangeError);
    const text = { ...defaultTextSettings("fr"), language: "de" as TextLanguage };
    expect(() => roomConfigurationRefusal(configuration({ text, timeLimit: limit(1) }))).toThrow(RangeError);
  });
});
