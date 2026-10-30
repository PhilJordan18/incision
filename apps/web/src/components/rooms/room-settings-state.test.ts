import { describe, expect, it } from "vitest";
import { awaitingSettings, draftConflict, draftTextRefusal, editableSettings, requiresSettingsRefresh, settingsDraft, settingsForm, validDraft, type SavedRoomSettings } from "./room-settings-state";

const TEXT_DEFAULTS = { textKind: "coherent", complexity: "medium", punctuation: true, numbers: false, capitals: true, accents: true, includeCharacters: [], excludeCharacters: [], bonusesEnabled: false };
import { roomSettingsCopy, roomStartNote } from "@/i18n/room-settings";
import { parseConfigureRoomForm } from "@/server/rooms/room-settings";

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
});
