import { DEFAULT_TEXT_SETTINGS, initialRoomSettings, type RoomSettings } from "@incision/database";
import { TIME_LIMIT_MAX_MS, TIME_LIMIT_MIN_MS } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { isRunnable, parseConfigureRoomForm } from "./room-settings";

function form(fields: Readonly<Record<string, string | readonly string[]>>): FormData {
  const value = new FormData();
  for (const [name, entry] of Object.entries(fields)) {
    for (const item of typeof entry === "string" ? [entry] : entry) {
      value.append(name, item);
    }
  }
  return value;
}

const VALID = {
  code: "ABCDEF", revision: "3", textLanguage: "en", wordCount: "50", timeLimitSeconds: "90", errorMode: "mandatory",
  textKind: "coherent", complexity: "medium", punctuation: "true", numbers: "false", capitals: "true", accents: "true", includeCharacters: "", excludeCharacters: "",
} as const;

describe("parseConfigureRoomForm", () => {
  it("accepts only 10–200 whole words and never substitutes the default for invalid input", () => {
    for (const wordCount of ["10", "50", "200"]) expect(parseConfigureRoomForm(form({ ...VALID, wordCount }))?.settings.wordCount).toBe(Number(wordCount));
    for (const wordCount of ["9", "201", "10.5", "1e2", "", " 50", "50\n", "0050", "５０"]) {
      expect(parseConfigureRoomForm(form({ ...VALID, wordCount })), wordCount).toBeUndefined();
    }
    const withFile = form(VALID);
    withFile.set("wordCount", new Blob(["50"]));
    expect(parseConfigureRoomForm(withFile)).toBeUndefined();
  });
  it("reads the code, the revision, the language and the limit in seconds, with mandatory correction", () => {
    expect(parseConfigureRoomForm(form(VALID))).toEqual({
      code: "ABCDEF",
      revision: 3,
      settings: { textLanguage: "en", wordCount: 50, timeLimitMs: 90_000, errorMode: "mandatory", ...DEFAULT_TEXT_SETTINGS },
    });
  });

  it("reads the text settings: kind, complexity, the four options as true or false, and random-only characters", () => {
    const random = { ...VALID, textKind: "random", complexity: "hard", punctuation: "false", numbers: "true", capitals: "false", accents: "false", includeCharacters: "KwK z", excludeCharacters: "é" };
    expect(parseConfigureRoomForm(form(random))?.settings).toMatchObject({
      textKind: "random", complexity: "hard", punctuation: false, numbers: true, capitals: false, accents: false,
      // One character per grapheme, lowercase, repeats and spaces dropped, in the order typed.
      includeCharacters: ["k", "w", "z"], excludeCharacters: ["é"],
    });
    // A character the language cannot hold is kept as typed, so the engine names the refusal.
    expect(parseConfigureRoomForm(form({ ...random, includeCharacters: "ß" }))?.settings.includeCharacters).toEqual(["ß"]);
  });

  it("refuses characters in coherent mode, which cannot express them (D-10)", () => {
    expect(parseConfigureRoomForm(form({ ...VALID, includeCharacters: "k" }))).toBeUndefined();
    expect(parseConfigureRoomForm(form({ ...VALID, excludeCharacters: "e" }))).toBeUndefined();
  });

  it.each([
    ["an unknown kind", { textKind: "custom" }],
    ["an unknown complexity", { complexity: "expert" }],
    ["an option spelled otherwise", { punctuation: "on" }],
    ["an option left out", { numbers: [] as string[] }],
    ["a repeated option", { accents: ["true", "false"] }],
    ["more characters than the bound", { textKind: "random", includeCharacters: "a".repeat(1_601) }],
  ])("refuses %s", (_, fields) => {
    expect(parseConfigureRoomForm(form({ ...VALID, ...fields }))).toBeUndefined();
  });

  it("canonicalises the code as the other room actions do", () => {
    expect(parseConfigureRoomForm(form({ ...VALID, code: " abcdef " }))?.code).toBe("ABCDEF");
  });

  it("accepts the limits races run with today, 30 s to 600 s, and nothing beyond", () => {
    expect(parseConfigureRoomForm(form({ ...VALID, timeLimitSeconds: String(TIME_LIMIT_MIN_MS / 1000) }))?.settings.timeLimitMs).toBe(TIME_LIMIT_MIN_MS);
    expect(parseConfigureRoomForm(form({ ...VALID, timeLimitSeconds: String(TIME_LIMIT_MAX_MS / 1000) }))?.settings.timeLimitMs).toBe(TIME_LIMIT_MAX_MS);
    expect(parseConfigureRoomForm(form({ ...VALID, timeLimitSeconds: "none" }))?.settings.timeLimitMs).toBeNull();
    for (const seconds of ["29", "601", "0", "", "null"]) {
      expect(parseConfigureRoomForm(form({ ...VALID, timeLimitSeconds: seconds })), seconds).toBeUndefined();
    }
  });

  it("refuses numbers a form would not send: signs, fractions, exponents, spaces, other digits, too many digits", () => {
    // Arabic-Indic and full-width sixty, then a trailing line feed: the pattern reads ASCII digits to the very end.
    for (const seconds of ["+60", "-60", "60.0", "6e1", " 60", "60\n", "0x3c", "0060", "٦٠", "６０"]) {
      expect(parseConfigureRoomForm(form({ ...VALID, timeLimitSeconds: seconds })), seconds).toBeUndefined();
    }
    for (const revision of ["-1", "1.5", "1e3", "", "1234567890"]) {
      expect(parseConfigureRoomForm(form({ ...VALID, revision })), revision).toBeUndefined();
    }
    expect(parseConfigureRoomForm(form({ ...VALID, revision: "999999999" }))?.revision).toBe(999_999_999);
  });

  it("refuses an unknown language, a malformed code, and a missing or repeated field", () => {
    for (const textLanguage of ["de", "FR", "", "fr-CA"]) {
      expect(parseConfigureRoomForm(form({ ...VALID, textLanguage })), textLanguage).toBeUndefined();
    }
    for (const code of ["", "not a code", "ABCDEFG"]) {
      expect(parseConfigureRoomForm(form({ ...VALID, code })), code).toBeUndefined();
    }
    for (const name of Object.keys(VALID)) {
      const missing: Record<string, string> = { ...VALID };
      delete missing[name];
      expect(parseConfigureRoomForm(form(missing)), `without ${name}`).toBeUndefined();
      expect(parseConfigureRoomForm(form({ ...VALID, [name]: [VALID[name as keyof typeof VALID], VALID[name as keyof typeof VALID]] })), `${name} twice`).toBeUndefined();
    }
    const withFile = form(VALID);
    withFile.set("timeLimitSeconds", new Blob(["60"]));
    expect(parseConfigureRoomForm(withFile)).toBeUndefined();
  });

  it("accepts free typing without accepting a forged limit in milliseconds", () => {
    expect(parseConfigureRoomForm(form({ ...VALID, errorMode: "free", timeLimitMs: "600000", $ACTION_ID_x: "" }))?.settings).toEqual({
      textLanguage: "en",
      wordCount: 50,
      timeLimitMs: 90_000,
      errorMode: "free",
      ...DEFAULT_TEXT_SETTINGS,
    });
  });

  it("refuses unknown modes instead of silently selecting mandatory correction", () => {
    for (const errorMode of ["", "FREE", "unknown", " mandatory "]) {
      expect(parseConfigureRoomForm(form({ ...VALID, errorMode }))).toBeUndefined();
    }
    const withFile = form(VALID);
    withFile.set("errorMode", new Blob(["free"]));
    expect(parseConfigureRoomForm(withFile)).toBeUndefined();
  });
});

describe("isRunnable", () => {
  const settings = (changes: Partial<RoomSettings>): RoomSettings => ({ ...initialRoomSettings("fr"), ...changes });
  it("refuses out-of-range stored word counts before any draw", () => {
    for (const wordCount of [9, 201, 50.5, NaN, Infinity]) expect(isRunnable(settings({ wordCount }))).toBe(false);
    for (const wordCount of [10, 200]) expect(isRunnable(settings({ wordCount }))).toBe(true);
  });

  it("runs mandatory correction with a 30 s to 600 s limit, a new room's settings included", () => {
    expect(isRunnable(initialRoomSettings("en"))).toBe(true);
    // Characters a coherent room could only hold if written by hand.
    expect(isRunnable(settings({ includeCharacters: ["k"] }))).toBe(false);
    expect(isRunnable(settings({ textKind: "random", includeCharacters: ["k"] }))).toBe(true);
    expect(isRunnable(settings({ timeLimitMs: TIME_LIMIT_MIN_MS }))).toBe(true);
    expect(isRunnable(settings({ timeLimitMs: TIME_LIMIT_MAX_MS }))).toBe(true);
  });

  it("refuses invalid limits while allowing both modes and unlimited races", () => {
    expect(isRunnable(settings({ timeLimitMs: null }))).toBe(true);
    expect(isRunnable(settings({ timeLimitMs: TIME_LIMIT_MAX_MS + 1 }))).toBe(false);
    expect(isRunnable(settings({ timeLimitMs: TIME_LIMIT_MAX_MS }))).toBe(true);
    expect(isRunnable(settings({ timeLimitMs: TIME_LIMIT_MIN_MS - 1 }))).toBe(false);
    for (const timeLimitMs of [null, TIME_LIMIT_MIN_MS, TIME_LIMIT_MAX_MS]) {
      expect(isRunnable(settings({ errorMode: "free", timeLimitMs }))).toBe(true);
    }
    for (const timeLimitMs of [NaN, Infinity, 30_000.5, -1]) expect(isRunnable(settings({ timeLimitMs }))).toBe(false);
  });
});
