import { BOT_LEVELS, COMPLEXITIES, ERROR_MODES, MAX_GRAPHEME_LENGTH, MAX_SETTING_CHARACTERS, MEMBER_ROLES, ROOM_PHASES, TEXT_KINDS, TEXT_LANGUAGES, MIN_TEXT_WORDS, MAX_TEXT_WORDS } from "@incision/domain";
import { z } from "zod";

/** The states of a race and the reasons it ended without results (`races`, ADR-0004, D-06). */
export const RACE_STATES = ["countdown", "racing", "finished", "interrupted"] as const;
export const INTERRUPTION_REASONS = ["room_closed", "server_stopped", "owner_lost", "save_failed", "engine_error"] as const;

/**
 * Room presence over Socket.IO (CP-06), shared by the browser and the server. Every
 * payload is validated with these schemas at the boundary (TECH-07).
 */
export const ROOM_WATCH_EVENT = "room:watch";
/** A handshake refused because the session could not be checked now (the database did not answer): the page tries again. */
export const HANDSHAKE_UNAVAILABLE = "UNAVAILABLE";
export const ROOM_SNAPSHOT_EVENT = "room:snapshot";
export const ROOM_EXPELLED_EVENT = "room:expelled";

/**
 * `pageId`: drawn by the page once and kept across its socket's reconnections, so that a
 * reconnected page takes its race input back from its own former socket (F-04.0).
 */
export const roomWatchPayloadSchema = z.object({ code: z.string().min(1).max(16), pageId: z.uuid().optional() }).strict();

/**
 * `room:watch` events a socket may send per window. A page sends one per connection and a
 * few retries; the server cuts a socket that sends more, and the page keeps below it.
 */
export const WATCH_LIMIT = { maxWatches: 5, windowMs: 10_000 } as const;

/** What every member of a room sees; no account id, only member ids. */
export const roomSnapshotSchema = z.object({
  code: z.string(),
  phase: z.enum(ROOM_PHASES),
  capacity: z.number(),
  revision: z.number(),
  /** Absent only on servers predating bot admission. */
  bots: z.array(z.object({ botId: z.uuid(), level: z.enum(BOT_LEVELS) })).max(30).optional(),
  members: z.array(
    z.object({
      memberId: z.string(),
      displayName: z.string(),
      role: z.enum(MEMBER_ROLES),
      isHost: z.boolean(),
      /** Public kind only, never an account/session identifier. Absent on older snapshots. */
      isGuest: z.boolean().optional(),
      /** At least one open socket of this member right now. */
      online: z.boolean(),
    }),
  ),
  /** The room's current or latest race, as the database holds it: how it ended, after a reconnection too. */
  race: z
    .object({
      raceId: z.string(),
      state: z.enum(RACE_STATES),
      interruptionReason: z.enum(INTERRUPTION_REASONS).nullable(),
    })
    .optional(),
  /**
   * What the next race runs with (F-03.1); `revision` is the one a change of settings must quote.
   * This server always sends it; a server older than F-03.1 did not.
   */
  settings: z
    .object({
      revision: z.number().int().nonnegative(),
      textLanguage: z.enum(TEXT_LANGUAGES),
      wordCount: z.number().int().min(MIN_TEXT_WORDS).max(MAX_TEXT_WORDS),
      /** Null: no time limit. */
      timeLimitMs: z.number().int().positive().nullable(),
      errorMode: z.enum(ERROR_MODES),
      /**
       * The text settings (F-03.1e). A server older than them ran D-19's text settings, which the
       * defaults restore. Characters are only shown back, so they are bounded, not re-checked.
       */
      textKind: z.enum(TEXT_KINDS).default("coherent"),
      complexity: z.enum(COMPLEXITIES).default("medium"),
      punctuation: z.boolean().default(true),
      numbers: z.boolean().default(false),
      capitals: z.boolean().default(true),
      accents: z.boolean().default(true),
      includeCharacters: z.array(z.string().max(MAX_GRAPHEME_LENGTH * 3)).max(MAX_SETTING_CHARACTERS).default([]),
      excludeCharacters: z.array(z.string().max(MAX_GRAPHEME_LENGTH * 3)).max(MAX_SETTING_CHARACTERS).default([]),
      /** Arcade (CONF-09, D-18); a server older than it ran training, which the default restores. */
      bonusesEnabled: z.boolean().default(false),
    })
    .optional(),
});
export type PublicRoomSnapshot = z.infer<typeof roomSnapshotSchema>;

export const ROOM_WATCH_ERRORS = ["INVALID_PAYLOAD", "UNAUTHORIZED", "NOT_A_MEMBER", "RATE_LIMITED", "UNAVAILABLE"] as const;

/** The browser validates what the server sends, too. */
export const roomWatchAckSchema = z.union([
  z.object({ ok: z.literal(true), selfMemberId: z.string(), snapshot: roomSnapshotSchema }),
  z.object({ ok: z.literal(false), error: z.enum(ROOM_WATCH_ERRORS) }),
]);
export type RoomWatchAck = z.infer<typeof roomWatchAckSchema>;
