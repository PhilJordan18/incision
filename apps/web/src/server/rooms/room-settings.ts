import type { RoomSettings } from "@incision/database";
import {
  COMPLEXITIES,
  MAX_GRAPHEME_LENGTH,
  MAX_SETTING_CHARACTERS,
  parseRoomCode,
  type RoomCode,
  settingCharacter,
  TEXT_KINDS,
  TEXT_LANGUAGES,
  TIME_LIMIT_MIN_MS,
  TIME_LIMIT_MAX_MS,
  MIN_TEXT_WORDS,
  MAX_TEXT_WORDS,
  toGraphemes,
} from "@incision/domain";
import { z } from "zod";

/** Both CONF-08 modes share the full CONF-01 duration range. */
export function isRunnable(settings: RoomSettings): boolean {
  const { timeLimitMs, errorMode, wordCount } = settings;
  return Number.isInteger(wordCount) && wordCount >= MIN_TEXT_WORDS && wordCount <= MAX_TEXT_WORDS
    && (errorMode === "mandatory" || errorMode === "free") && (timeLimitMs === null || (Number.isSafeInteger(timeLimitMs)
    && timeLimitMs >= TIME_LIMIT_MIN_MS && timeLimitMs <= TIME_LIMIT_MAX_MS))
    && TEXT_KINDS.includes(settings.textKind) && COMPLEXITIES.includes(settings.complexity)
    && (settings.textKind === "random" || (settings.includeCharacters.length === 0 && settings.excludeCharacters.length === 0));
}

/** "true" or "false", as the form sends a boolean: never "on", absence or any other spelling. */
const flag = z.enum(["true", "false"]).transform((value) => value === "true");

/**
 * Characters to include or exclude, as one text field: each grapheme is a character, lowercased,
 * repeats dropped, kept in the order typed. The field is bounded before it is split (TECH-07); a
 * character the language cannot hold stays, so the engine names it (UNSUPPORTED_CHARACTER).
 */
const characters = z
  .string()
  .max(MAX_SETTING_CHARACTERS * MAX_GRAPHEME_LENGTH)
  .transform((value) => [...new Set(toGraphemes(value).filter((grapheme) => grapheme.trim() !== "").map((grapheme) => grapheme.toLowerCase()))])
  .pipe(z.array(z.string()).max(MAX_SETTING_CHARACTERS));

/** A character as the engine stores it, or the input as typed when the language cannot hold it. */
export function storedCharacter(input: string, language: (typeof TEXT_LANGUAGES)[number]): string {
  return settingCharacter(input, language) ?? input;
}

/** Decimal digits only, as a form sends a number: no sign, exponent, spaces or fraction. */
const digits = (maxLength: number) =>
  z
    .string()
    .regex(new RegExp(`^\\d{1,${maxLength}}$`))
    .transform(Number);

/**
 * The host's change of settings (F-03.1): the settings revision its page shows, the text language,
 * a time limit in whole seconds, the explicit typing mode, and the text settings (F-03.1e, CONF-03
 * to CONF-07): kind, complexity, the four options and, in random mode, the characters.
 */
const configureRoomFieldsSchema = z.object({
  revision: digits(9),
  textLanguage: z.enum(TEXT_LANGUAGES),
  wordCount: digits(3).pipe(z.number().int().min(MIN_TEXT_WORDS).max(MAX_TEXT_WORDS)),
  errorMode: z.enum(["mandatory", "free"]),
  timeLimitSeconds: z.union([z.literal("none").transform(() => null), digits(3).pipe(z.number().min(TIME_LIMIT_MIN_MS / 1000).max(TIME_LIMIT_MAX_MS / 1000))]),
  textKind: z.enum(TEXT_KINDS),
  complexity: z.enum(COMPLEXITIES),
  punctuation: flag,
  numbers: flag,
  capitals: flag,
  accents: flag,
  includeCharacters: characters,
  excludeCharacters: characters,
});

const FIELDS = [
  "revision", "textLanguage", "wordCount", "timeLimitSeconds", "errorMode",
  "textKind", "complexity", "punctuation", "numbers", "capitals", "accents", "includeCharacters", "excludeCharacters",
] as const;

export type ConfigureRoomRequest = {
  readonly code: RoomCode;
  readonly revision: number;
  readonly settings: Omit<RoomSettings, "revision">;
};

/**
 * The room code and the fields of the form, each given exactly once; undefined for anything else.
 * Other entries of the form data (React's own) are not read.
 */
export function parseConfigureRoomForm(formData: FormData): ConfigureRoomRequest | undefined {
  const codes = formData.getAll("code");
  const code = codes.length === 1 && typeof codes[0] === "string" ? parseRoomCode(codes[0]) : undefined;
  const fields = configureRoomFieldsSchema.safeParse(
    Object.fromEntries(
      FIELDS.map((name) => {
        const values = formData.getAll(name);
        return [name, values.length === 1 ? values[0] : undefined];
      }),
    ),
  );
  if (code === undefined || !code.ok || !fields.success) {
    return undefined;
  }
  const { revision, textLanguage, wordCount, timeLimitSeconds, errorMode, textKind, includeCharacters, excludeCharacters, ...text } = fields.data;
  // Coherent mode cannot express characters (D-10): the page never sends any with it.
  if (textKind === "coherent" && (includeCharacters.length > 0 || excludeCharacters.length > 0)) {
    return undefined;
  }
  return {
    code: code.code,
    revision,
    settings: {
      textLanguage, wordCount, timeLimitMs: timeLimitSeconds === null ? null : timeLimitSeconds * 1000, errorMode, textKind, ...text,
      includeCharacters: includeCharacters.map((character) => storedCharacter(character, textLanguage)),
      excludeCharacters: excludeCharacters.map((character) => storedCharacter(character, textLanguage)),
    },
  };
}
