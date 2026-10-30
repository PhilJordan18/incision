// No `import "server-only"`: the custom server (server.ts) loads this module outside Next, where that
// package does not resolve. The word data's sentinel and the client bundle check guard the boundary.
import type { RoomSettings } from "@incision/database";
import {
  raceTextRefusal,
  type RandomContentRefusal,
  type RandomWords,
  type TextLanguage,
  type TextSettings,
  type TextSettingsRefusal,
  textSettingsRefusal,
} from "@incision/domain";
import { EXCLUSIONS, FORBIDDEN_PAIRS, WORD_LISTS } from "@incision/domain/words";

/**
 * Why the server refuses a room's text settings (CONF-03 to CONF-07, D-10), each translated in the
 * settings panel. The engine's proofs only: a bounded search that ends without a text
 * (TEXT_SEARCH_EXHAUSTED) is never presented as a proof, so it can only refuse a start.
 */
export type TextSettingsProblem = TextSettingsRefusal | RandomContentRefusal | "WORDS_UNAVAILABLE";

/** The engine's settings of a room: coherent settings cannot even carry characters (D-10). */
export function roomTextSettings(settings: Omit<RoomSettings, "revision">): TextSettings {
  const base = {
    language: settings.textLanguage,
    wordCount: settings.wordCount,
    complexity: settings.complexity,
    options: { punctuation: settings.punctuation, numbers: settings.numbers, capitals: settings.capitals, accents: settings.accents },
  };
  return settings.textKind === "random"
    ? { ...base, kind: "random", include: settings.includeCharacters, exclude: settings.excludeCharacters }
    : { ...base, kind: "coherent" };
}

/**
 * The reviewed word data of a language (#42), or undefined while only the hand-written fixtures
 * ship: random mode then refuses rather than draw test words (no fixture fallback).
 */
export function approvedRandomWords(language: TextLanguage): RandomWords | undefined {
  const words = { list: WORD_LISTS[language], exclusions: EXCLUSIONS[language], pairs: FORBIDDEN_PAIRS[language] };
  return [words.list.version, words.exclusions.version, words.pairs.version].some((version) => version.startsWith("fixture")) ? undefined : words;
}

/**
 * The refusal a save gets from the engine's data-free checks (shared with the browser): cheap, run
 * before the rate budget. Coherent settings are checked against the corpus at the start, which alone
 * holds it (a start without a compatible passage is refused and writes nothing).
 */
export function textSettingsCheck(settings: TextSettings): TextSettingsRefusal | undefined {
  return textSettingsRefusal(settings);
}

/**
 * In random mode, the engine's proofs on the approved lists. They build the whole pool (tens of
 * milliseconds on the reviewed lists), so a save runs them only once the rate budget allowed it.
 */
export function randomWordsProblem(settings: TextSettings, words: (language: TextLanguage) => RandomWords | undefined = approvedRandomWords): TextSettingsProblem | undefined {
  if (settings.kind === "coherent") return undefined;
  const data = words(settings.language);
  if (data === undefined) return "WORDS_UNAVAILABLE";
  const proven = raceTextRefusal({ settings, words: data });
  // raceTextRefusal repeats the data-free checks first, already passed before the budget.
  return proven === undefined || proven === "NO_COMPATIBLE_PASSAGE" ? undefined : proven;
}

/** Both checks in their order; for callers outside a rate-limited action (tests, tools). */
export function textSettingsProblem(settings: TextSettings, words: (language: TextLanguage) => RandomWords | undefined = approvedRandomWords): TextSettingsProblem | undefined {
  return textSettingsCheck(settings) ?? randomWordsProblem(settings, words);
}
