import { ENTRANT_KINDS, ERROR_MODES, MAX_BATCH_EVENTS, MAX_GRAPHEME_LENGTH } from "@incision/domain";
import { z } from "zod";
import { LOCALES } from "../i18n/locale";

/**
 * Race events over Socket.IO (F-04.0), shared by the browser and the server. These schemas
 * check the structure only: what the engine assumes (an object, an array of non-null events of
 * its two kinds) and what bounds the work of one message. The values are the engine's to judge
 * (`applyKeystrokes`): a sequence below 1, an empty batch, an empty or multi-grapheme insert, or
 * more than MAX_BATCH_EVENTS events are refused by it, with the snapshot its contract promises.
 * A payload that fails these schemas is not a batch at all. The entrant always comes from the
 * session, never from here.
 */
export const RACE_BATCH_EVENT = "race:batch";

/** What one message may carry: twice what the engine accepts, so its own refusal stays reachable. */
export const WIRE_MAX_EVENTS = 2 * MAX_BATCH_EVENTS;
/** A wire bound on one insert, above the engine's grapheme bound (which refuses longer ones). */
export const WIRE_MAX_INSERT_LENGTH = 4 * MAX_GRAPHEME_LENGTH;

const inputEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("insert"), grapheme: z.string().max(WIRE_MAX_INSERT_LENGTH) }).strict(),
  z.object({ type: z.literal("deleteBackward") }).strict(),
]);

export const keystrokeBatchPayloadSchema = z
  .object({
    raceId: z.uuid(),
    seq: z.number(),
    textVersion: z.number(),
    events: z.array(inputEventSchema).max(WIRE_MAX_EVENTS),
  })
  .strict();
export type KeystrokeBatchPayload = z.infer<typeof keystrokeBatchPayloadSchema>;

export type ParsedBatch =
  | { readonly success: true; readonly data: KeystrokeBatchPayload }
  | { readonly success: false; readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[] };

/** Parses a batch payload, refusing an oversized array, in constant time, before parsing any event. */
export function parseKeystrokeBatch(payload: unknown): ParsedBatch {
  if (typeof payload === "object" && payload !== null && "events" in payload && Array.isArray(payload.events) && payload.events.length > WIRE_MAX_EVENTS) {
    return { success: false, issues: [{ path: ["events"], message: `More than ${WIRE_MAX_EVENTS} events` }] };
  }
  const parsed = keystrokeBatchPayloadSchema.safeParse(payload);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, issues: parsed.error.issues };
}

/**
 * The host starts the race of its room (COURSE-02). The payload carries nothing: the account
 * comes from the session, the room from the database, the text and the settings from the server.
 */
export const RACE_START_EVENT = "race:start";
export const raceStartPayloadSchema = z.object({}).strict();
export const RACE_START_ERRORS = [
  "UNAUTHORIZED",
  "INVALID_PAYLOAD",
  "NOT_IN_A_ROOM",
  "NOT_HOST",
  "ROOM_NOT_WAITING",
  "NOT_ENOUGH_PARTICIPANTS",
  "NO_HUMAN_PARTICIPANT",
  "RATE_LIMITED",
  /** New races are closed on this server (RACES_ENABLED is not `true`). */
  "RACES_CLOSED",
  /** No passage of the corpus serves the race's settings in its language (or no corpus is active): no race is written. */
  "NO_COMPATIBLE_PASSAGE",
  "UNAVAILABLE",
] as const;
export type RaceStartError = (typeof RACE_START_ERRORS)[number];
export const raceStartAckSchema = z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), error: z.enum(RACE_START_ERRORS) })]);
export type RaceStartAck = z.infer<typeof raceStartAckSchema>;

/**
 * A second tab of the same member observes; this asks for the input to move here
 * (docs/architecture/state-machines.md §2). The previous tab then observes.
 */
export const RACE_CONTROL_EVENT = "race:control";
export const raceControlPayloadSchema = z.object({ raceId: z.uuid() }).strict();
export const RACE_CONTROL_ERRORS = ["UNAUTHORIZED", "INVALID_PAYLOAD", "NOT_AN_ENTRANT", "NO_RACE", "RATE_LIMITED"] as const;
export const raceControlAckSchema = z.union([z.object({ ok: z.literal(true) }), z.object({ ok: z.literal(false), error: z.enum(RACE_CONTROL_ERRORS) })]);
export type RaceControlAck = z.infer<typeof raceControlAckSchema>;

/**
 * « Je suis là » (D-17): the entrant answers the inactivity question, from any of its tabs
 * (presence, not control). For the engine it is activity, as a newly applied batch is.
 */
export const RACE_PRESENT_EVENT = "race:present";
/** The entrant gives the race up once the page had it confirmed (COURSE-07): terminal, from any of its tabs. */
export const RACE_ABANDON_EVENT = "race:abandon";
/** The payload of both: the race they are about; the entrant comes from the session. */
export const raceEntrantActionPayloadSchema = z.object({ raceId: z.uuid() }).strict();
export const RACE_ENTRANT_ACTION_ERRORS = ["UNAUTHORIZED", "INVALID_PAYLOAD", "NOT_AN_ENTRANT", "NO_RACE", "SUSPENDED", "RATE_LIMITED"] as const;
export type RaceEntrantActionError = (typeof RACE_ENTRANT_ACTION_ERRORS)[number];
export const raceEntrantActionAckSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.enum(RACE_ENTRANT_ACTION_ERRORS) }),
]);
export type RaceEntrantActionAck = z.infer<typeof raceEntrantActionAckSchema>;

/** Server to browser: the race's text and settings, from the countdown on, never before (COURSE-03). */
export const RACE_REVEAL_EVENT = "race:reveal";
/** Server to browser: everyone's public progress (COURSE-05), at most four times a second. */
export const RACE_PROGRESS_EVENT = "race:progress";
/** Server to the entrant's own tabs: its typing state, its live measures and which tab types. */
export const RACE_SELF_EVENT = "race:self";
/** Server to browser: the race ended and its results are being saved; nothing is official yet. */
export const RACE_CONFIRMING_EVENT = "race:confirming";

const instant = z.number().int().nonnegative();
const entrantStatus = z.enum(["racing", "finished", "timedOut", "abandoned"]);

/** `RaceReveal` of @incision/domain, plus who runs, and the server's clock to count down from. */
export const raceRevealPayloadSchema = z.object({
  reveal: z.object({
    raceId: z.uuid(),
    text: z.array(z.string()).readonly(),
    errorMode: z.enum(ERROR_MODES),
    countdownAt: instant,
    startsAt: instant,
    timeLimit: instant.nullable(),
  }),
  /** The language of the text, so pages mark it for assistive technology (WCAG 3.1.2). */
  language: z.enum(LOCALES),
  entrants: z.array(z.object({ entrantId: z.string(), displayName: z.string() })).readonly(),
  /** The reader's own entrant; null for a spectator. */
  selfEntrantId: z.string().nullable(),
  serverNow: instant,
});
export type RaceRevealPayload = z.infer<typeof raceRevealPayloadSchema>;

/** `RaceBroadcast` of @incision/domain. */
export const raceProgressPayloadSchema = z.object({
  broadcast: z.object({
    raceId: z.uuid(),
    revision: z.number().int().nonnegative(),
    phase: z.enum(["countdown", "racing", "ended", "interrupted"]),
    startsAt: instant,
    endedAt: instant.optional(),
    timeLimit: instant.nullable(),
    entrants: z.array(
      z.object({
        entrantId: z.string(),
        kind: z.enum(ENTRANT_KINDS),
        status: entrantStatus,
        position: z.number().int().nonnegative(),
        length: z.number().int().positive(),
        netWpm: z.number().nonnegative(),
        endedAt: instant.optional(),
        /** D-17: no activity for INACTIVITY_WARNING_MS; only ever true while the entrant races. */
        inactive: z.boolean(),
      }),
    ).readonly(),
  }),
  serverNow: instant,
});
export type RaceProgressPayload = z.infer<typeof raceProgressPayloadSchema>;

/** `EntrantSnapshot` of @incision/domain: rebuilds one player's typing zone. */
export const entrantSnapshotSchema = z.object({
  raceId: z.uuid(),
  entrantId: z.string(),
  textVersion: z.number().int().nonnegative(),
  target: z.array(z.string()).readonly(),
  typed: z.array(z.string()).readonly(),
  pendingError: z.boolean(),
  ackSeq: z.number().int().nonnegative(),
  status: entrantStatus,
  counters: z.object({ correctInserts: z.number().int().nonnegative(), totalInserts: z.number().int().nonnegative() }),
});
export type EntrantSnapshotPayload = z.infer<typeof entrantSnapshotSchema>;

/** Appendix A measures, as the engine computed them on the server (`toEntrantMeasures`). */
const measuresSchema = z.object({ netWpm: z.number().nonnegative(), accuracy: z.number().min(0).max(100) });

export const raceSelfPayloadSchema = z.object({
  snapshot: entrantSnapshotSchema,
  measures: measuresSchema,
  /** Only the controlling tab sends keystrokes; the others observe (state-machines §2). */
  control: z.enum(["controlling", "observing"]),
  /** Why this entrant abandoned, once it did: a choice, a lost connection (D-06) or inactivity (D-17). */
  abandonReason: z.enum(["voluntary", "disconnection", "inactivity"]).optional(),
});
export type RaceSelfPayload = z.infer<typeof raceSelfPayloadSchema>;

export const raceConfirmingPayloadSchema = z.object({ raceId: z.uuid() });

/** `KeystrokeResult` of @incision/domain: the engine's answer to a batch. */
const keystrokeResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("applied"), seq: z.number(), ackSeq: z.number(), textVersion: z.number() }),
  z.object({ outcome: z.literal("duplicate"), seq: z.number(), ackSeq: z.number() }),
  z.object({ outcome: z.literal("resync"), seq: z.number(), reason: z.enum(["OUT_OF_ORDER", "TEXT_VERSION_CHANGED"]), snapshot: entrantSnapshotSchema }),
  z.object({
    outcome: z.literal("refused"),
    seq: z.number(),
    reason: z.enum(["WRONG_RACE", "UNKNOWN_ENTRANT", "NOT_RACING", "ENTRANT_TERMINAL", "BATCH_TOO_LARGE", "INVALID_INPUT", "IMPLAUSIBLE"]),
    snapshot: entrantSnapshotSchema.optional(),
  }),
]);

/**
 * Refusals before the engine: a payload that is not a batch, a socket that is not an entrant
 * or not its controlling tab, no race run here, a lease not confirmed in time (ADR-0004), or
 * more than MAX_BATCHES_PER_SECOND messages.
 */
export const RACE_BATCH_ERRORS = ["UNAUTHORIZED", "INVALID_PAYLOAD", "NOT_AN_ENTRANT", "NOT_CONTROLLING", "NO_RACE", "SUSPENDED", "RATE_LIMITED"] as const;
export type RaceBatchError = (typeof RACE_BATCH_ERRORS)[number];

export const raceBatchAckSchema = z.union([
  z.object({ ok: z.literal(true), result: keystrokeResultSchema, self: raceSelfPayloadSchema }),
  z.object({ ok: z.literal(false), error: z.enum(RACE_BATCH_ERRORS) }),
]);
export type RaceBatchAck = z.infer<typeof raceBatchAckSchema>;
