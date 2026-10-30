import {
  type Complexity,
  MAX_SETTING_CHARACTERS,
  MAX_TEXT_WORDS,
  MIN_TEXT_WORDS,
  type TextKind,
  type TextSettings,
  type TextSettingsRefusal,
  textSettingsRefusal,
  TIME_LIMIT_MAX_MS,
  TIME_LIMIT_MIN_MS,
  characterEntries,
} from "@incision/domain";
import type { PublicRoomSnapshot } from "@/rooms/protocol";
import type { ConfigureRoomError } from "@/server/rooms/actions";

export type SavedRoomSettings = NonNullable<PublicRoomSnapshot["settings"]>;
export type SettingsDraft = {
  readonly revision: number;
  readonly textLanguage: "fr" | "en";
  readonly seconds: string;
  readonly wordCount: string;
  readonly errorMode: SavedRoomSettings["errorMode"];
  readonly textKind: TextKind;
  readonly complexity: Complexity;
  readonly punctuation: boolean;
  readonly numbers: boolean;
  readonly capitals: boolean;
  readonly accents: boolean;
  /** As typed: one character per grapheme, repeats ignored. Kept while coherent, never sent then (D-10). */
  readonly include: string;
  readonly exclude: string;
  /** CONF-09 (D-18): Arcade when true, training otherwise. */
  readonly bonusesEnabled: boolean;
};

/** The four text options of CONF-06, in the panel's order. */
export const TEXT_OPTIONS = ["punctuation", "numbers", "capitals", "accents"] as const;
export type TextOption = (typeof TEXT_OPTIONS)[number];

/** Most code units a characters field accepts: the server's bound on the characters themselves. */
export const MAX_CHARACTERS_INPUT = MAX_SETTING_CHARACTERS;

/** The characters of a field as the server reads them (`characterEntries`, shared with the parser). */
export const draftCharacters = characterEntries;

/** This tranche exposes only settings the current server can save. Never coerce future values. */
export function editableSettings(settings: SavedRoomSettings | undefined): settings is SavedRoomSettings {
  return settings !== undefined && Number.isInteger(settings.wordCount) && settings.wordCount >= MIN_TEXT_WORDS && settings.wordCount <= MAX_TEXT_WORDS
    && (settings.errorMode === "mandatory" || settings.errorMode === "free") && (settings.timeLimitMs === null || (Number.isInteger(settings.timeLimitMs / 1000) && settings.timeLimitMs >= TIME_LIMIT_MIN_MS
    && settings.timeLimitMs <= TIME_LIMIT_MAX_MS));
}

export function settingsDraft(settings: SavedRoomSettings): SettingsDraft {
  return {
    revision: settings.revision, textLanguage: settings.textLanguage, wordCount: String(settings.wordCount),
    seconds: settings.timeLimitMs === null ? "none" : String(settings.timeLimitMs / 1000), errorMode: settings.errorMode,
    textKind: settings.textKind, complexity: settings.complexity,
    punctuation: settings.punctuation, numbers: settings.numbers, capitals: settings.capitals, accents: settings.accents,
    include: settings.includeCharacters.join(""), exclude: settings.excludeCharacters.join(""),
    bonusesEnabled: settings.bonusesEnabled,
  };
}

/**
 * The engine's check that needs no data (shared with the server, CONF-04 to CONF-07), on the
 * draft; undefined while the word count is not a number yet, which `validDraft` reports.
 */
export function draftTextRefusal(draft: SettingsDraft): TextSettingsRefusal | undefined {
  if (!/^\d{1,3}$/.test(draft.wordCount)) return undefined;
  const base = {
    language: draft.textLanguage, wordCount: Number(draft.wordCount), complexity: draft.complexity,
    options: { punctuation: draft.punctuation, numbers: draft.numbers, capitals: draft.capitals, accents: draft.accents },
  };
  const include = draftCharacters(draft.include);
  const exclude = draftCharacters(draft.exclude);
  // The fields hold at most MAX_CHARACTERS_INPUT code units, so the engine's bound always holds.
  const settings: TextSettings = draft.textKind === "random" ? { ...base, kind: "random", include, exclude } : { ...base, kind: "coherent" };
  return textSettingsRefusal(settings);
}

export function draftConflict(draft: SettingsDraft | null, settings: SavedRoomSettings | undefined): boolean {
  return draft !== null && (settings === undefined || draft.revision !== settings.revision);
}

export function validDraft(draft: SettingsDraft): boolean {
  return /^\d{1,3}$/.test(draft.wordCount) && Number(draft.wordCount) >= MIN_TEXT_WORDS && Number(draft.wordCount) <= MAX_TEXT_WORDS
    && (draft.errorMode === "mandatory" || draft.errorMode === "free") && (draft.seconds === "none" || (/^\d{1,3}$/.test(draft.seconds) && Number(draft.seconds) >= TIME_LIMIT_MIN_MS / 1000
    && Number(draft.seconds) <= TIME_LIMIT_MAX_MS / 1000))
    && draft.include.length <= MAX_CHARACTERS_INPUT && draft.exclude.length <= MAX_CHARACTERS_INPUT && draftTextRefusal(draft) === undefined;
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
  form.set("wordCount", draft.wordCount);
  form.set("timeLimitSeconds", draft.seconds);
  form.set("errorMode", draft.errorMode);
  form.set("textKind", draft.textKind);
  form.set("complexity", draft.complexity);
  for (const option of TEXT_OPTIONS) form.set(option, String(draft[option]));
  // Coherent mode cannot express characters (D-10): the fields stay in the draft, not in the request.
  form.set("includeCharacters", draft.textKind === "random" ? draftCharacters(draft.include).join("") : "");
  form.set("excludeCharacters", draft.textKind === "random" ? draftCharacters(draft.exclude).join("") : "");
  form.set("bonusesEnabled", String(draft.bonusesEnabled));
  return form;
}
