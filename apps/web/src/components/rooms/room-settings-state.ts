import { TIME_LIMIT_MIN_MS, TIME_LIMIT_MAX_MS } from "@incision/domain";
import type { PublicRoomSnapshot } from "@/rooms/protocol";
import type { ConfigureRoomError } from "@/server/rooms/actions";

export type SavedRoomSettings = NonNullable<PublicRoomSnapshot["settings"]>;
export type SettingsDraft = {
  readonly revision: number;
  readonly textLanguage: "fr" | "en";
  readonly seconds: string;
};

/** This tranche exposes only settings the current server can save. Never coerce future values. */
export function editableSettings(settings: SavedRoomSettings | undefined): settings is SavedRoomSettings {
  return settings !== undefined && settings.errorMode === "mandatory" && (settings.timeLimitMs === null || (Number.isInteger(settings.timeLimitMs / 1000) && settings.timeLimitMs >= TIME_LIMIT_MIN_MS
    && settings.timeLimitMs <= TIME_LIMIT_MAX_MS));
}

export function settingsDraft(settings: SavedRoomSettings): SettingsDraft {
  return { revision: settings.revision, textLanguage: settings.textLanguage, seconds: settings.timeLimitMs === null ? "none" : String(settings.timeLimitMs / 1000) };
}

export function draftConflict(draft: SettingsDraft | null, settings: SavedRoomSettings | undefined): boolean {
  return draft !== null && (settings === undefined || draft.revision !== settings.revision);
}

export function validDraft(draft: SettingsDraft): boolean {
  return draft.seconds === "none" || (/^\d{1,3}$/.test(draft.seconds) && Number(draft.seconds) >= TIME_LIMIT_MIN_MS / 1000
    && Number(draft.seconds) <= TIME_LIMIT_MAX_MS / 1000);
}

/** Acknowledgement alone is not the new snapshot. A newer snapshot also satisfies the ack. */
export function awaitingSettings(revision: number | undefined, settings: SavedRoomSettings | undefined): boolean {
  return revision !== undefined && (settings === undefined || settings.revision < revision);
}

/** A stale authority or uncertain outcome must be read again before another edit. */
export function requiresSettingsRefresh(error: ConfigureRoomError | undefined): boolean {
  return error === "STALE_REVISION" || error === "UNAVAILABLE" || error === "NOT_HOST"
    || error === "NOT_IN_A_ROOM" || error === "ROOM_NOT_WAITING";
}

export function settingsForm(code: string, draft: SettingsDraft): FormData {
  const form = new FormData();
  form.set("code", code);
  form.set("revision", String(draft.revision));
  form.set("textLanguage", draft.textLanguage);
  form.set("timeLimitSeconds", draft.seconds);
  return form;
}
