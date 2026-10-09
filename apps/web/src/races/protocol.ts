import { MAX_BATCH_EVENTS, MAX_GRAPHEME_LENGTH } from "@incision/domain";
import { z } from "zod";

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
export const RACE_ABANDON_EVENT = "race:abandon";

/** What one message may carry: twice what the engine accepts, so its own refusal stays reachable. */
const WIRE_MAX_EVENTS = 2 * MAX_BATCH_EVENTS;
/** A wire bound on one insert, above the engine's grapheme bound (which refuses longer ones). */
const WIRE_MAX_INSERT_LENGTH = 4 * MAX_GRAPHEME_LENGTH;

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

/** Leaving the race on purpose (COURSE-07): the reason is always `voluntary`, set by the server. */
export const abandonPayloadSchema = z.object({ raceId: z.uuid() }).strict();
