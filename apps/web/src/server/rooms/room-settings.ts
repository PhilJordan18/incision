import type { RoomSettings } from "@incision/database";
import { parseRoomCode, type RoomCode, TEXT_LANGUAGES, TIME_LIMIT_MIN_MS } from "@incision/domain";
import { z } from "zod";

/**
 * The longest time limit races run with today (F-03.1a). "No limit" and longer limits wait for the
 * card that lifts this restriction. Their prerequisite is in place: a suspended lease no longer
 * runs inactivity against a runner who cannot answer (D-17, #168, COURSE-09). The database
 * already holds the engine's whole range (none, or 30 s to 10 min).
 */
export const RUNNABLE_TIME_LIMIT_MAX_MS = 120_000;

/** Settings a race starts with today: a 30 s to 120 s limit and mandatory correction (free typing waits for F-04.3). */
export function isRunnable(settings: RoomSettings): settings is RoomSettings & { readonly timeLimitMs: number } {
  const { timeLimitMs, errorMode } = settings;
  return errorMode === "mandatory" && timeLimitMs !== null && timeLimitMs >= TIME_LIMIT_MIN_MS && timeLimitMs <= RUNNABLE_TIME_LIMIT_MAX_MS;
}

/** Decimal digits only, as a form sends a number: no sign, exponent, spaces or fraction. */
const digits = (maxLength: number) =>
  z
    .string()
    .regex(new RegExp(`^\\d{1,${maxLength}}$`))
    .transform(Number);

/**
 * The host's change of settings (F-03.1a): the settings revision its page shows, the text language
 * and a time limit in whole seconds. The error mode is not editable yet.
 */
const configureRoomFieldsSchema = z.object({
  revision: digits(9),
  textLanguage: z.enum(TEXT_LANGUAGES),
  timeLimitSeconds: digits(3).pipe(z.number().min(TIME_LIMIT_MIN_MS / 1000).max(RUNNABLE_TIME_LIMIT_MAX_MS / 1000)),
});

const FIELDS = ["revision", "textLanguage", "timeLimitSeconds"] as const;

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
  const { revision, textLanguage, timeLimitSeconds } = fields.data;
  return { code: code.code, revision, settings: { textLanguage, timeLimitMs: timeLimitSeconds * 1000, errorMode: "mandatory" } };
}
