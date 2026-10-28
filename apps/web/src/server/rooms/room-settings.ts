import type { RoomSettings } from "@incision/database";
import { parseRoomCode, type RoomCode, TEXT_LANGUAGES, TIME_LIMIT_MIN_MS, TIME_LIMIT_MAX_MS } from "@incision/domain";
import { z } from "zod";

/** Both CONF-08 modes share the full CONF-01 duration range. */
export function isRunnable(settings: RoomSettings): boolean {
  const { timeLimitMs, errorMode } = settings;
  return (errorMode === "mandatory" || errorMode === "free") && (timeLimitMs === null || (Number.isSafeInteger(timeLimitMs)
    && timeLimitMs >= TIME_LIMIT_MIN_MS && timeLimitMs <= TIME_LIMIT_MAX_MS));
}

/** Decimal digits only, as a form sends a number: no sign, exponent, spaces or fraction. */
const digits = (maxLength: number) =>
  z
    .string()
    .regex(new RegExp(`^\\d{1,${maxLength}}$`))
    .transform(Number);

/**
 * The host's change of settings (F-03.1a): the settings revision its page shows, the text language
 * a time limit in whole seconds, and the explicit typing mode.
 */
const configureRoomFieldsSchema = z.object({
  revision: digits(9),
  textLanguage: z.enum(TEXT_LANGUAGES),
  errorMode: z.enum(["mandatory", "free"]),
  timeLimitSeconds: z.union([z.literal("none").transform(() => null), digits(3).pipe(z.number().min(TIME_LIMIT_MIN_MS / 1000).max(TIME_LIMIT_MAX_MS / 1000))]),
});

const FIELDS = ["revision", "textLanguage", "timeLimitSeconds", "errorMode"] as const;

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
  const { revision, textLanguage, timeLimitSeconds, errorMode } = fields.data;
  return { code: code.code, revision, settings: { textLanguage, timeLimitMs: timeLimitSeconds === null ? null : timeLimitSeconds * 1000, errorMode } };
}
