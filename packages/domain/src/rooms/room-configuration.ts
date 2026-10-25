/**
 * A room's race configuration (F-03.1): what the host chooses between races and what every race of
 * the room starts with. Pure model only; the server stores it, revises it and authorises the host.
 */
import { TIME_LIMIT_MAX_MS, TIME_LIMIT_MIN_MS } from "../race/limits";
import { ERROR_MODES, type ErrorMode } from "../race/types";
import { textSettingsRefusal, type CoherentTextSettings, type TextSettings, type TextSettingsRefusal } from "../text/settings";
import type { Duration } from "../time";
import type { TextLanguage } from "../words/types";

export type RoomConfiguration = {
  /** CONF-02 to CONF-07: the text's language is the room's, independent of the interface's. */
  readonly text: TextSettings;
  /** CONF-08. */
  readonly errorMode: ErrorMode;
  /** CONF-01: null is no limit at all (D-17); otherwise TIME_LIMIT_MIN_MS to TIME_LIMIT_MAX_MS. */
  readonly timeLimit: Duration | null;
};

/** D-19's text: coherent, 50 words, medium; punctuation, capitals and accents on, numbers off. */
export function defaultTextSettings(language: TextLanguage): CoherentTextSettings {
  return {
    kind: "coherent",
    language,
    wordCount: 50,
    complexity: "medium",
    options: { punctuation: true, numbers: false, capitals: true, accents: true },
  };
}

/** D-19: a new room's configuration, with its text in the language given (the interface's). */
export function defaultRoomConfiguration(language: TextLanguage): RoomConfiguration {
  return { text: defaultTextSettings(language), errorMode: "mandatory", timeLimit: null };
}

export type RoomConfigurationRefusal = "INVALID_TIME_LIMIT" | TextSettingsRefusal;

/**
 * Why a configuration cannot be saved, or undefined when it can: the time limit first (the rule of
 * `createRaceRefusal`), then `textSettingsRefusal`. RangeError for values only a bug can produce.
 */
export function roomConfigurationRefusal(configuration: RoomConfiguration): RoomConfigurationRefusal | undefined {
  const { errorMode, timeLimit } = configuration;
  if (!ERROR_MODES.includes(errorMode)) {
    throw new RangeError(`Invalid error mode ${String(errorMode)}`);
  }
  if (timeLimit !== null && !(Number.isSafeInteger(timeLimit) && timeLimit >= TIME_LIMIT_MIN_MS && timeLimit <= TIME_LIMIT_MAX_MS)) {
    return "INVALID_TIME_LIMIT";
  }
  return textSettingsRefusal(configuration.text);
}
