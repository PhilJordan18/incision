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
import type { TextSettingsProblem } from "@/server/rooms/text-settings";

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

/** The word count as the server accepts it: a whole number of the range, never clamped. */
export function validWordCount(draft: SettingsDraft): boolean {
  return /^\d{1,3}$/.test(draft.wordCount) && Number(draft.wordCount) >= MIN_TEXT_WORDS && Number(draft.wordCount) <= MAX_TEXT_WORDS;
}

/** No limit, or the server's whole-second range. */
export function validSeconds(draft: SettingsDraft): boolean {
  return draft.seconds === "none" || (/^\d{1,3}$/.test(draft.seconds) && Number(draft.seconds) >= TIME_LIMIT_MIN_MS / 1000
    && Number(draft.seconds) <= TIME_LIMIT_MAX_MS / 1000);
}

export function validDraft(draft: SettingsDraft): boolean {
  return validWordCount(draft)
    && (draft.errorMode === "mandatory" || draft.errorMode === "free") && validSeconds(draft)
    && draft.include.length <= MAX_CHARACTERS_INPUT && draft.exclude.length <= MAX_CHARACTERS_INPUT && draftTextRefusal(draft) === undefined;
}

/**
 * The fields of the edit form (DA2-8), in the form's order: text (language, type, complexity,
 * word count, options, characters), duration, typing mode, game mode. The four text options
 * are one field, as the summary shows them.
 */
export const SETTINGS_FIELDS = ["textLanguage", "textKind", "complexity", "wordCount", "options", "include", "exclude", "seconds", "errorMode", "bonusesEnabled"] as const;
export type SettingsField = (typeof SETTINGS_FIELDS)[number];

/** A typed number equal to the saved one however it is written (« 060 » is 60); anything else differs. */
function sameNumber(typed: string, saved: number): boolean {
  return /^\d{1,3}$/.test(typed) && Number(typed) === saved;
}

/** What a field holds in a draft, as one comparable value (the four options are one field). */
function fieldValue(draft: SettingsDraft, field: SettingsField): string {
  return field === "options" ? TEXT_OPTIONS.map((option) => String(draft[option])).join(",") : String(draft[field]);
}

/**
 * Whether the server's refusal of `refused` still speaks of `draft`: as long as none of the fields
 * it names changed. Editing another field keeps the message beside its field; changing a named
 * field removes it, and typing the refused value back shows it again.
 */
export function refusalApplies(problem: TextSettingsProblem, refused: SettingsDraft, draft: SettingsDraft): boolean {
  return refusalFields(problem).every((field) => fieldValue(refused, field) === fieldValue(draft, field));
}

/**
 * The fields whose draft differs from the saved settings, in the form's order: what a save would
 * change. Compared as the request would carry them, so characters typed twice, or kept in a draft
 * while the text is coherent (D-10, never sent), are not changes. A draft that cannot be read as a
 * number differs from any saved number.
 */
export function pendingFields(draft: SettingsDraft, settings: SavedRoomSettings): readonly SettingsField[] {
  const random = draft.textKind === "random";
  const characters = (field: "include" | "exclude", saved: readonly string[]) =>
    (random ? draftCharacters(draft[field]).join("") : "") !== (settings.textKind === "random" ? saved.join("") : "");
  const savedSeconds = settings.timeLimitMs === null ? "none" : String(settings.timeLimitMs / 1000);
  const changed: Record<SettingsField, boolean> = {
    textLanguage: draft.textLanguage !== settings.textLanguage,
    textKind: draft.textKind !== settings.textKind,
    complexity: draft.complexity !== settings.complexity,
    wordCount: !sameNumber(draft.wordCount, settings.wordCount),
    options: TEXT_OPTIONS.some((option) => draft[option] !== settings[option]),
    include: characters("include", settings.includeCharacters),
    exclude: characters("exclude", settings.excludeCharacters),
    seconds: settings.timeLimitMs === null || draft.seconds === "none" ? draft.seconds !== savedSeconds : !sameNumber(draft.seconds, settings.timeLimitMs / 1000),
    errorMode: draft.errorMode !== settings.errorMode,
    bonusesEnabled: draft.bonusesEnabled !== settings.bonusesEnabled,
  };
  return SETTINGS_FIELDS.filter((field) => changed[field]);
}

/**
 * The fields a text refusal is about, in the form's order: its message sits beside the first and
 * every one is marked in error. The four refusals about the characters mark both character fields,
 * as before the form was grouped; the server's own refusals (random words) name what their
 * message asks to change.
 */
const REFUSAL_FIELDS = {
  WORD_COUNT_OUT_OF_RANGE: ["wordCount"],
  UNSUPPORTED_CHARACTER: ["include", "exclude"],
  CHARACTER_INCLUDED_AND_EXCLUDED: ["include", "exclude"],
  INCLUDED_CHARACTER_DISABLED: ["include", "exclude"],
  OPTION_FULLY_EXCLUDED: ["include", "exclude"],
  NO_COMPATIBLE_WORDS: ["complexity", "exclude"],
  INCLUDED_CHARACTER_UNAVAILABLE: ["include"],
  INCLUDED_CHARACTERS_DO_NOT_FIT: ["wordCount", "include"],
  FORBIDDEN_PAIRS_UNAVOIDABLE: ["complexity", "include", "exclude"],
  WORDS_UNAVAILABLE: ["textKind"],
} as const satisfies Record<TextSettingsProblem, readonly SettingsField[]>;

export function refusalFields(problem: TextSettingsProblem): readonly SettingsField[] {
  return REFUSAL_FIELDS[problem];
}

/** The two refusals that an option switched off or emptied also explains: the options point to the message too. */
export function refusalConcernsOptions(problem: TextSettingsProblem): boolean {
  return problem === "INCLUDED_CHARACTER_DISABLED" || problem === "OPTION_FULLY_EXCLUDED";
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
