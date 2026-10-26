import { describe, expect, it } from "vitest";
import { awaitingSettings, draftConflict, editableSettings, settingsDraft, settingsForm, validDraft, type SavedRoomSettings } from "./room-settings-state";
import { roomSettingsCopy, roomStartNote } from "@/i18n/room-settings";
import { parseConfigureRoomForm } from "@/server/rooms/room-settings";

const saved: SavedRoomSettings & { timeLimitMs: number } = { revision: 7, textLanguage: "fr", timeLimitMs: 120_000, errorMode: "mandatory" };

describe("waiting-room settings state", () => {
  it("pins the settings revision, not the unrelated room revision", () => {
    const draft = { ...settingsDraft(saved), textLanguage: "en" as const, seconds: "60" };
    const form = settingsForm("ABCDEF", draft);
    expect([...form.entries()]).toEqual([["code", "ABCDEF"], ["revision", "7"], ["textLanguage", "en"], ["timeLimitSeconds", "60"]]);
    expect(parseConfigureRoomForm(form)?.settings).toEqual({ textLanguage: "en", timeLimitMs: 60_000, errorMode: "mandatory" });
    expect(draftConflict(draft, { ...saved })).toBe(false);
    expect(draftConflict(draft, { ...saved, revision: 8 })).toBe(true);
    expect(draft).toEqual({ revision: 7, textLanguage: "en", seconds: "60" });
  });
  it("handles ack before snapshot, snapshot before ack, and a newer snapshot without rollback", () => {
    expect(awaitingSettings(8, saved)).toBe(true);
    expect(awaitingSettings(8, { ...saved, revision: 8 })).toBe(false);
    expect(awaitingSettings(8, { ...saved, revision: 9 })).toBe(false);
    expect(awaitingSettings(undefined, saved)).toBe(false);
    expect(awaitingSettings(8, undefined)).toBe(true);
  });
  it("does not invent defaults or convert unsupported stored values", () => {
    for (const settings of [undefined, { ...saved, timeLimitMs: null }, { ...saved, timeLimitMs: 180_000 }, { ...saved, errorMode: "free" as const }, { ...saved, timeLimitMs: 30_500 }]) {
      expect(editableSettings(settings)).toBe(false);
    }
    expect(editableSettings({ ...saved, timeLimitMs: 30_000 })).toBe(true);
    expect(editableSettings(saved)).toBe(true);
    expect(draftConflict(settingsDraft(saved), undefined)).toBe(true);
  });
  it("accepts only the server's whole-second range", () => {
    for (const seconds of ["", "29", "121", "30.5", "3e1", "-30", " 60", "0030"]) expect(validDraft({ ...settingsDraft(saved), seconds })).toBe(false);
    for (const seconds of ["30", "60", "120"]) expect(validDraft({ ...settingsDraft(saved), seconds })).toBe(true);
  });
  it("uses the real duration and mode in the start note in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      expect(roomStartNote({ ...saved, timeLimitMs: 60_000 }, locale)).toContain("60 s");
      expect(roomStartNote({ ...saved, timeLimitMs: null, errorMode: "free" }, locale)).toContain(roomSettingsCopy(locale).unlimited);
      expect(roomStartNote({ ...saved, errorMode: "free" }, locale)).toContain(roomSettingsCopy(locale).free);
      expect(roomStartNote(undefined, locale)).toBe(roomSettingsCopy(locale).unavailable);
      expect(Object.keys(roomSettingsCopy(locale).errors)).toHaveLength(7);
    }
  });
});
