import { COMPLEXITIES, DISPLAY_NAME_MAX_LENGTH, ROOM_PHASES, TEXT_KINDS, TEXT_LANGUAGES, ROOM_MAX_CAPACITY, MAX_TEXT_WORDS } from "@incision/domain";
import { z } from "zod";

/**
 * The public room explorer over Socket.IO (JOIN-02), shared by the browser and the server.
 * Anyone may watch, signed in or not: it carries only what a PUBLIC room shows to anyone
 * holding its code. CODE and PRIVATE rooms, accounts, members and invitations never appear.
 */
export const PUBLIC_ROOMS_WATCH_EVENT = "publicRooms:watch";
export const PUBLIC_ROOMS_UNWATCH_EVENT = "publicRooms:unwatch";
export const PUBLIC_ROOMS_EVENT = "publicRooms:list";

/** Watch requests a socket may send per window; a page sends one per connection. */
export const PUBLIC_ROOMS_WATCH_LIMIT = { maxWatches: 5, windowMs: 10_000 } as const;

const OPEN_PHASES = ROOM_PHASES.filter((phase) => phase !== "closed") as [Exclude<(typeof ROOM_PHASES)[number], "closed">, ...Exclude<(typeof ROOM_PHASES)[number], "closed">[]];

export const publicRoomEntrySchema = z.object({
  code: z.string().regex(/^[2-9A-HJKMNP-Z]{6}$/),
  /** Display names count code points (PostgreSQL `char_length`), not UTF-16 units. */
  hostName: z.string().min(1).refine((name) => [...name].length <= DISPLAY_NAME_MAX_LENGTH),
  phase: z.enum(OPEN_PHASES),
  participants: z.number().int().min(0).max(ROOM_MAX_CAPACITY),
  capacity: z.number().int().min(2).max(ROOM_MAX_CAPACITY),
  textLanguage: z.enum(TEXT_LANGUAGES),
  complexity: z.enum(COMPLEXITIES),
  textKind: z.enum(TEXT_KINDS),
  wordCount: z.number().int().min(1).max(MAX_TEXT_WORDS),
  /** Bonuses on (D-18). */
  arcade: z.boolean(),
  /** Admits a new participant now: waiting or results, and a free place (SALLE-09, SALLE-05). */
  joinable: z.boolean(),
}).strict();
export type PublicRoomEntry = z.infer<typeof publicRoomEntrySchema>;

export const publicRoomListSchema = z.object({ rooms: z.array(publicRoomEntrySchema).max(100) }).strict();
export type PublicRoomList = z.infer<typeof publicRoomListSchema>;

/** The answer to a watch, as the browser checks it before trusting it. */
export const publicRoomsWatchAckSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), rooms: publicRoomListSchema.shape.rooms }).strict(),
  z.object({ ok: z.literal(false), error: z.enum(["UNAVAILABLE", "RATE_LIMITED"]) }).strict(),
]);

export type PublicRoomsWatchAck =
  | ({ readonly ok: true } & PublicRoomList)
  | { readonly ok: false; readonly error: "UNAVAILABLE" | "RATE_LIMITED" };

/** Explorer filters (JOIN-02, D-18): text language and complexity; undefined means all. */
export type PublicRoomFilters = { readonly language?: (typeof TEXT_LANGUAGES)[number]; readonly complexity?: (typeof COMPLEXITIES)[number] };

const filterSchema = z.object({
  language: z.enum(TEXT_LANGUAGES).optional().catch(undefined),
  complexity: z.enum(COMPLEXITIES).optional().catch(undefined),
});

/** Reads the filters from the query string; an unknown or repeated value means "all". */
export function parsePublicRoomFilters(params: Record<string, string | string[] | undefined>): PublicRoomFilters {
  const single = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
  const parsed = filterSchema.parse({ language: single(params.language), complexity: single(params.complexity) });
  return { ...(parsed.language && { language: parsed.language }), ...(parsed.complexity && { complexity: parsed.complexity }) };
}

export function filterPublicRooms(rooms: readonly PublicRoomEntry[], filters: PublicRoomFilters): PublicRoomEntry[] {
  return rooms.filter((room) => (filters.language === undefined || room.textLanguage === filters.language)
    && (filters.complexity === undefined || room.complexity === filters.complexity));
}

/** The query string of a filter choice, for links, the no-JS form and the address bar. */
export function publicRoomFiltersQuery(filters: PublicRoomFilters): string {
  const query = new URLSearchParams();
  if (filters.language !== undefined) query.set("language", filters.language);
  if (filters.complexity !== undefined) query.set("complexity", filters.complexity);
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}
