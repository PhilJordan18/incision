import { initialRoomSettings, type RoomSettings } from "@incision/database";
import { TIME_LIMIT_MAX_MS, TIME_LIMIT_MIN_MS } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { isRunnable, parseConfigureRoomForm, RUNNABLE_TIME_LIMIT_MAX_MS } from "./room-settings";

function form(fields: Readonly<Record<string, string | readonly string[]>>): FormData {
  const value = new FormData();
  for (const [name, entry] of Object.entries(fields)) {
    for (const item of typeof entry === "string" ? [entry] : entry) {
      value.append(name, item);
    }
  }
  return value;
}

const VALID = { code: "ABCDEF", revision: "3", textLanguage: "en", timeLimitSeconds: "90" } as const;

describe("parseConfigureRoomForm", () => {
  it("reads the code, the revision, the language and the limit in seconds, with mandatory correction", () => {
    expect(parseConfigureRoomForm(form(VALID))).toEqual({
      code: "ABCDEF",
      revision: 3,
      settings: { textLanguage: "en", timeLimitMs: 90_000, errorMode: "mandatory" },
    });
  });

  it("canonicalises the code as the other room actions do", () => {
    expect(parseConfigureRoomForm(form({ ...VALID, code: " abcdef " }))?.code).toBe("ABCDEF");
  });

  it("accepts the limits races run with today, 30 s to 120 s, and nothing beyond", () => {
    expect(parseConfigureRoomForm(form({ ...VALID, timeLimitSeconds: String(TIME_LIMIT_MIN_MS / 1000) }))?.settings.timeLimitMs).toBe(TIME_LIMIT_MIN_MS);
    expect(parseConfigureRoomForm(form({ ...VALID, timeLimitSeconds: String(RUNNABLE_TIME_LIMIT_MAX_MS / 1000) }))?.settings.timeLimitMs).toBe(RUNNABLE_TIME_LIMIT_MAX_MS);
    // "No limit" and the engine's longer limits wait for D-17: refused, never replaced by another limit.
    for (const seconds of ["29", "121", String(TIME_LIMIT_MAX_MS / 1000), "0", "", "none", "null"]) {
      expect(parseConfigureRoomForm(form({ ...VALID, timeLimitSeconds: seconds })), seconds).toBeUndefined();
    }
  });

  it("refuses numbers a form would not send: signs, fractions, exponents, spaces, too many digits", () => {
    for (const seconds of ["+60", "-60", "60.0", "6e1", " 60", "0x3c", "0060"]) {
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

  it("ignores what the host cannot choose yet: the error mode and a limit in milliseconds", () => {
    expect(parseConfigureRoomForm(form({ ...VALID, errorMode: "free", timeLimitMs: "600000", $ACTION_ID_x: "" }))?.settings).toEqual({
      textLanguage: "en",
      timeLimitMs: 90_000,
      errorMode: "mandatory",
    });
  });
});

describe("isRunnable", () => {
  const settings = (changes: Partial<RoomSettings>): RoomSettings => ({ ...initialRoomSettings("fr"), ...changes });

  it("runs mandatory correction with a 30 s to 120 s limit, a new room's settings included", () => {
    expect(isRunnable(initialRoomSettings("en"))).toBe(true);
    expect(isRunnable(settings({ timeLimitMs: TIME_LIMIT_MIN_MS }))).toBe(true);
    expect(isRunnable(settings({ timeLimitMs: RUNNABLE_TIME_LIMIT_MAX_MS }))).toBe(true);
  });

  it("does not run yet what the database holds beyond: no limit, longer limits (D-17), free typing (F-04.3)", () => {
    expect(isRunnable(settings({ timeLimitMs: null }))).toBe(false);
    expect(isRunnable(settings({ timeLimitMs: RUNNABLE_TIME_LIMIT_MAX_MS + 1 }))).toBe(false);
    expect(isRunnable(settings({ timeLimitMs: TIME_LIMIT_MAX_MS }))).toBe(false);
    expect(isRunnable(settings({ timeLimitMs: TIME_LIMIT_MIN_MS - 1 }))).toBe(false);
    expect(isRunnable(settings({ errorMode: "free" }))).toBe(false);
  });
});
