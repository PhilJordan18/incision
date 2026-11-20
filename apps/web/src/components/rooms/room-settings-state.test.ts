import { describe, expect, it } from "vitest";
import { awaitingSettings, draftConflict, draftTextRefusal, editableSettings, pendingFields, refusalApplies, refusalConcernsOptions, refusalFields, requiresSettingsRefresh, SETTINGS_FIELDS, settingsDraft, settingsForm, validDraft, validSeconds, validWordCount, type SavedRoomSettings } from "./room-settings-state";
import { roomSettingsCopy, roomStartNote } from "@/i18n/room-settings";
import { parseConfigureRoomForm } from "@/server/rooms/room-settings";

const TEXT_DEFAULTS = { textKind: "coherent", complexity: "medium", punctuation: true, numbers: false, capitals: true, accents: true, includeCharacters: [], excludeCharacters: [], bonusesEnabled: false };

const saved: SavedRoomSettings & { timeLimitMs: number } = {
  revision: 7, textLanguage: "fr", wordCount: 50, timeLimitMs: 120_000, errorMode: "mandatory",
  textKind: "coherent", complexity: "medium", punctuation: true, numbers: false, capitals: true, accents: true, includeCharacters: [], excludeCharacters: [], bonusesEnabled: false,
};

describe("waiting-room settings state", () => {
  it("blocks stale authority and unknown outcomes until a read, even before the snapshot catches up", () => {
    for (const error of ["NOT_HOST", "NOT_IN_A_ROOM", "ROOM_NOT_WAITING", "STALE_REVISION", "UNAVAILABLE"] as const) expect(requiresSettingsRefresh(error)).toBe(true);
    for (const error of [undefined, "INVALID_SETTINGS", "RATE_LIMITED"] as const) expect(requiresSettingsRefresh(error)).toBe(false);
  });
  it("pins the settings revision, not the unrelated room revision", () => {
    const draft = { ...settingsDraft(saved), textLanguage: "en" as const, seconds: "60" };
    const form = settingsForm("ABCDEF", draft);
    expect([...form.entries()]).toEqual([
      ["code", "ABCDEF"], ["revision", "7"], ["textLanguage", "en"], ["wordCount", "50"], ["timeLimitSeconds", "60"], ["errorMode", "mandatory"],
      ["textKind", "coherent"], ["complexity", "medium"], ["punctuation", "true"], ["numbers", "false"], ["capitals", "true"], ["accents", "true"],
      ["includeCharacters", ""], ["excludeCharacters", ""], ["bonusesEnabled", "false"],
    ]);
    expect(parseConfigureRoomForm(form)?.settings).toEqual({ textLanguage: "en", wordCount: 50, timeLimitMs: 60_000, errorMode: "mandatory", ...TEXT_DEFAULTS });
    expect(draftConflict(draft, { ...saved })).toBe(false);
    expect(draftConflict(draft, { ...saved, revision: 8 })).toBe(true);
    expect(draft).toEqual({ revision: 7, textLanguage: "en", wordCount: "50", seconds: "60", errorMode: "mandatory", textKind: "coherent", complexity: "medium", punctuation: true, numbers: false, capitals: true, accents: true, include: "", exclude: "", bonusesEnabled: false });
  });
  it("handles ack before snapshot, snapshot before ack, and a newer snapshot without rollback", () => {
    expect(awaitingSettings(8, saved)).toBe(true);
    expect(awaitingSettings(8, { ...saved, revision: 8 })).toBe(false);
    expect(awaitingSettings(8, { ...saved, revision: 9 })).toBe(false);
    expect(awaitingSettings(undefined, saved)).toBe(false);
    expect(awaitingSettings(8, undefined)).toBe(true);
  });
  it("does not invent defaults or convert unsupported stored values", () => {
    for (const settings of [undefined, { ...saved, timeLimitMs: 600_001 }, { ...saved, timeLimitMs: 30_500 }]) {
      expect(editableSettings(settings)).toBe(false);
    }
    expect(editableSettings({ ...saved, timeLimitMs: 30_000 })).toBe(true);
    expect(editableSettings(saved)).toBe(true);
    expect(editableSettings({ ...saved, timeLimitMs: null })).toBe(true);
    expect(editableSettings({ ...saved, timeLimitMs: 600_000 })).toBe(true);
    const unlimited = settingsDraft({ ...saved, timeLimitMs: null });
    expect(unlimited.seconds).toBe("none");
    expect(parseConfigureRoomForm(settingsForm("ABCDEF", unlimited))?.settings.timeLimitMs).toBeNull();
    expect(draftConflict(settingsDraft(saved), undefined)).toBe(true);
  });
  it("round-trips free typing without changing its duration or revision", () => {
    for (const timeLimitMs of [null, 30_000, 600_000]) {
      const free = { ...saved, errorMode: "free" as const, timeLimitMs };
      expect(editableSettings(free)).toBe(true);
      const draft = settingsDraft(free);
      expect(validDraft(draft)).toBe(true);
      expect(parseConfigureRoomForm(settingsForm("ABCDEF", draft))).toEqual({
        code: "ABCDEF", revision: saved.revision,
        settings: { textLanguage: "fr", wordCount: 50, errorMode: "free", timeLimitMs, ...TEXT_DEFAULTS },
      });
    }
  });
  it("accepts only the server's whole-second range", () => {
    for (const seconds of ["", "29", "601", "30.5", "3e1", "-30", " 60", "0030"]) expect(validDraft({ ...settingsDraft(saved), seconds })).toBe(false);
    for (const seconds of ["none", "30", "60", "120", "121", "600"]) expect(validDraft({ ...settingsDraft(saved), seconds })).toBe(true);
  });
  it("round-trips the word-count bounds and refuses malformed drafts without clamping", () => {
    for (const wordCount of ["10", "50", "200"]) {
      const draft = { ...settingsDraft(saved), wordCount };
      expect(validDraft(draft)).toBe(true);
      expect(parseConfigureRoomForm(settingsForm("ABCDEF", draft))?.settings.wordCount).toBe(Number(wordCount));
    }
    for (const wordCount of ["", "9", "201", "10.5", "2e1", "-10", " 50", "0050", "50\n"]) {
      const draft = { ...settingsDraft(saved), wordCount };
      expect(validDraft(draft), wordCount).toBe(false);
      expect(parseConfigureRoomForm(settingsForm("ABCDEF", draft)), wordCount).toBeUndefined();
    }
    for (const wordCount of [9, 201, 50.5, NaN]) expect(editableSettings({ ...saved, wordCount })).toBe(false);
  });
  it("uses the real duration and mode in the start note in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      expect(roomStartNote({ ...saved, timeLimitMs: 60_000 }, locale)).toContain("60 s");
      expect(roomStartNote({ ...saved, timeLimitMs: null, errorMode: "free" }, locale)).toContain(roomSettingsCopy(locale).unlimited);
      expect(roomStartNote({ ...saved, errorMode: "free" }, locale)).toContain(roomSettingsCopy(locale).free);
      expect(roomStartNote(undefined, locale)).toBe(roomSettingsCopy(locale).unavailable);
      expect(Object.keys(roomSettingsCopy(locale).errors)).toHaveLength(8);
      expect(roomStartNote({ ...saved, textKind: "random", complexity: "hard" }, locale)).toContain(roomSettingsCopy(locale).random);
    }
  });

  it("round-trips Arcade (bonuses on) and training, and names the mode in the start note (CONF-09, D-18)", () => {
    const arcade = { ...saved, bonusesEnabled: true };
    expect(parseConfigureRoomForm(settingsForm("ABCDEF", settingsDraft(arcade)))?.settings.bonusesEnabled).toBe(true);
    expect(parseConfigureRoomForm(settingsForm("ABCDEF", settingsDraft(saved)))?.settings.bonusesEnabled).toBe(false);
    for (const locale of ["fr", "en"] as const) {
      expect(roomStartNote(arcade, locale)).toContain(roomSettingsCopy(locale).arcade);
      expect(roomStartNote(saved, locale)).toContain(roomSettingsCopy(locale).training);
    }
  });

  it("round-trips random settings and sends characters only in random mode (D-10)", () => {
    const random = { ...saved, textKind: "random" as const, complexity: "hard" as const, numbers: true, accents: false, includeCharacters: ["k", "w"], excludeCharacters: ["e"] };
    const draft = settingsDraft(random);
    expect(draft).toMatchObject({ textKind: "random", include: "kw", exclude: "e" });
    expect(validDraft(draft)).toBe(true);
    expect(parseConfigureRoomForm(settingsForm("ABCDEF", draft))?.settings).toMatchObject({ textKind: "random", complexity: "hard", numbers: true, accents: false, includeCharacters: ["k", "w"], excludeCharacters: ["e"] });
    // Switching back to coherent keeps the typed characters in the draft but never sends them.
    const coherent = { ...draft, textKind: "coherent" as const };
    expect(validDraft(coherent)).toBe(true);
    expect(parseConfigureRoomForm(settingsForm("ABCDEF", coherent))?.settings).toMatchObject({ textKind: "coherent", includeCharacters: [], excludeCharacters: [] });
  });

  it("refuses with the engine's reason the drafts the server would refuse, before any request", () => {
    const random = { ...settingsDraft(saved), textKind: "random" as const };
    expect(draftTextRefusal({ ...random, include: "k", exclude: "K" })).toBe("CHARACTER_INCLUDED_AND_EXCLUDED");
    expect(draftTextRefusal({ ...random, include: "7" })).toBe("INCLUDED_CHARACTER_DISABLED");
    expect(draftTextRefusal({ ...random, include: "ß" })).toBe("UNSUPPORTED_CHARACTER");
    expect(draftTextRefusal({ ...random, numbers: true, exclude: "0123456789" })).toBe("OPTION_FULLY_EXCLUDED");
    expect(draftTextRefusal({ ...random, include: "(", exclude: ")" })).toBe("CHARACTER_INCLUDED_AND_EXCLUDED");
    expect(validDraft({ ...random, include: "k", exclude: "k" })).toBe(false);
    // The same characters in coherent mode are not settings at all.
    expect(draftTextRefusal({ ...random, textKind: "coherent", include: "k", exclude: "k" })).toBeUndefined();
    for (const locale of ["fr", "en"] as const) expect(Object.keys(roomSettingsCopy(locale).textRefusals)).toHaveLength(10);
  });

  // DA2-8: the grouped edit form reads these; the rules above are unchanged.
  it("names the invalid field with the same bounds as the whole draft", () => {
    for (const wordCount of ["", "9", "201", "10.5", "2e1", "-10", " 50", "0050", "50\n"]) expect(validWordCount({ ...settingsDraft(saved), wordCount }), wordCount).toBe(false);
    for (const wordCount of ["10", "50", "200"]) expect(validWordCount({ ...settingsDraft(saved), wordCount })).toBe(true);
    for (const seconds of ["", "29", "601", "30.5", "3e1", "-30", " 60", "0030"]) expect(validSeconds({ ...settingsDraft(saved), seconds }), seconds).toBe(false);
    for (const seconds of ["none", "30", "600"]) expect(validSeconds({ ...settingsDraft(saved), seconds })).toBe(true);
    // One field in error never hides the other, and both make the draft invalid.
    const both = { ...settingsDraft(saved), wordCount: "9", seconds: "29" };
    expect([validWordCount(both), validSeconds(both), validDraft(both)]).toEqual([false, false, false]);
    expect(validSeconds({ ...settingsDraft(saved), wordCount: "9" })).toBe(true);
  });
  it("lists pending changes field by field, in the form's order, against the saved settings", () => {
    const draft = settingsDraft(saved);
    expect(pendingFields(draft, saved)).toEqual([]);
    expect(pendingFields({ ...draft, textLanguage: "en" }, saved)).toEqual(["textLanguage"]);
    expect(pendingFields({ ...draft, wordCount: "60" }, saved)).toEqual(["wordCount"]);
    expect(pendingFields({ ...draft, wordCount: "" }, saved)).toEqual(["wordCount"]);
    expect(pendingFields({ ...draft, seconds: "none" }, saved)).toEqual(["seconds"]);
    expect(pendingFields({ ...draft, seconds: "120" }, saved)).toEqual([]);
    expect(pendingFields({ ...draft, errorMode: "free", bonusesEnabled: true }, saved)).toEqual(["errorMode", "bonusesEnabled"]);
    // The four options are one field; going back to the saved value is no change.
    expect(pendingFields({ ...draft, numbers: true, capitals: false }, saved)).toEqual(["options"]);
    const toggled = { ...draft, numbers: true, capitals: false };
    expect(pendingFields({ ...toggled, numbers: false, capitals: true }, saved)).toEqual([]);
    const everything = { ...draft, textLanguage: "en" as const, textKind: "random" as const, complexity: "hard" as const, wordCount: "20", accents: false, include: "kw", exclude: "e", seconds: "none", errorMode: "free" as const, bonusesEnabled: true };
    expect(pendingFields(everything, saved)).toEqual([...SETTINGS_FIELDS]);
  });
  it("compares characters as the request carries them (D-10): kept, repeated or coherent drafts are not changes", () => {
    const random = { ...saved, textKind: "random" as const, includeCharacters: ["k", "w"], excludeCharacters: ["e"] };
    const draft = settingsDraft(random);
    expect(pendingFields(draft, random)).toEqual([]);
    expect(pendingFields({ ...draft, include: "kkww" }, random)).toEqual([]);
    expect(pendingFields({ ...draft, include: "kwz" }, random)).toEqual(["include"]);
    expect(pendingFields({ ...draft, exclude: "" }, random)).toEqual(["exclude"]);
    // Going coherent drops the saved characters on save: the type and both fields change.
    expect(pendingFields({ ...draft, textKind: "coherent" }, random)).toEqual(["textKind", "include", "exclude"]);
    // Characters typed, then kept in a coherent draft, are never sent: not a change.
    expect(pendingFields({ ...settingsDraft(saved), include: "kw" }, saved)).toEqual([]);
    expect(pendingFields({ ...settingsDraft(saved), textKind: "random", include: "kw" }, saved)).toEqual(["textKind", "include"]);
  });
  it("a concurrent save changes what is pending without touching the draft", () => {
    const draft = { ...settingsDraft(saved), seconds: "45" };
    const remote = { ...saved, revision: 8, timeLimitMs: 45_000, textLanguage: "en" as const };
    expect(pendingFields(draft, saved)).toEqual(["seconds"]);
    expect(pendingFields(draft, remote)).toEqual(["textLanguage"]);
    expect(draftConflict(draft, remote)).toBe(true);
    expect(draft.seconds).toBe("45");
  });
  it("places every text refusal on fields of the form, the character refusals on both character fields", () => {
    for (const locale of ["fr", "en"] as const) {
      for (const problem of Object.keys(roomSettingsCopy(locale).textRefusals) as (keyof ReturnType<typeof roomSettingsCopy>["textRefusals"])[]) {
        const fields = refusalFields(problem);
        expect(fields.length, problem).toBeGreaterThan(0);
        // In the form's order, so the first is where the message sits and where focus goes.
        expect([...fields], problem).toEqual(SETTINGS_FIELDS.filter((field) => fields.includes(field)));
      }
    }
    for (const problem of ["UNSUPPORTED_CHARACTER", "CHARACTER_INCLUDED_AND_EXCLUDED", "INCLUDED_CHARACTER_DISABLED", "OPTION_FULLY_EXCLUDED"] as const) expect(refusalFields(problem)).toEqual(["include", "exclude"]);
    expect(refusalFields("WORD_COUNT_OUT_OF_RANGE")).toEqual(["wordCount"]);
    expect(refusalFields("WORDS_UNAVAILABLE")).toEqual(["textKind"]);
    expect(refusalConcernsOptions("INCLUDED_CHARACTER_DISABLED")).toBe(true);
    expect(refusalConcernsOptions("OPTION_FULLY_EXCLUDED")).toBe(true);
    expect(refusalConcernsOptions("CHARACTER_INCLUDED_AND_EXCLUDED")).toBe(false);
  });
  it("reads a number however it is written: « 060 » is not a change from 60", () => {
    const draft = settingsDraft({ ...saved, wordCount: 60, timeLimitMs: 60_000 });
    const sixty = { ...saved, wordCount: 60, timeLimitMs: 60_000 };
    expect(pendingFields({ ...draft, wordCount: "060", seconds: "060" }, sixty)).toEqual([]);
    expect(pendingFields({ ...draft, wordCount: "61", seconds: "061" }, sixty)).toEqual(["wordCount", "seconds"]);
    expect(pendingFields({ ...draft, wordCount: "6e1", seconds: "none" }, sixty)).toEqual(["wordCount", "seconds"]);
    expect(pendingFields({ ...draft, seconds: "60" }, { ...sixty, timeLimitMs: null })).toEqual(["seconds"]);
  });
  it("keeps a server refusal while the fields it names are as refused, whatever else changes", () => {
    const refused = { ...settingsDraft(saved), textKind: "random" as const, complexity: "easy" as const, exclude: "aeiou" };
    // NO_COMPATIBLE_WORDS names the complexity and the excluded characters.
    expect(refusalApplies("NO_COMPATIBLE_WORDS", refused, refused)).toBe(true);
    expect(refusalApplies("NO_COMPATIBLE_WORDS", refused, { ...refused, seconds: "60", bonusesEnabled: true, errorMode: "free" })).toBe(true);
    // The text's kind and language change what the server can produce: the refusal no longer speaks of the draft.
    expect(refusalApplies("NO_COMPATIBLE_WORDS", refused, { ...refused, textLanguage: "en" })).toBe(false);
    expect(refusalApplies("NO_COMPATIBLE_WORDS", refused, { ...refused, textKind: "coherent" })).toBe(false);
    expect(refusalApplies("NO_COMPATIBLE_WORDS", refused, { ...refused, complexity: "hard" })).toBe(false);
    expect(refusalApplies("NO_COMPATIBLE_WORDS", refused, { ...refused, exclude: "aei" })).toBe(false);
    // Back to the refused value: the refusal speaks of the draft again.
    expect(refusalApplies("NO_COMPATIBLE_WORDS", refused, { ...{ ...refused, exclude: "aei" }, exclude: "aeiou" })).toBe(true);
    expect(refusalApplies("WORDS_UNAVAILABLE", refused, { ...refused, exclude: "" })).toBe(true);
    expect(refusalApplies("WORDS_UNAVAILABLE", refused, { ...refused, textKind: "coherent" })).toBe(false);
  });
});
