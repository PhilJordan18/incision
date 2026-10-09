import { MAX_BATCH_EVENTS } from "@incision/domain";
import { z } from "zod";

/**
 * Race events over Socket.IO (F-04.0), shared by the browser and the server. The schemas
 * guarantee the structure the engine assumes (an object, a bounded array of non-null events);
 * the engine itself judges the values (sequence, text version, one grapheme per insert) and
 * refuses them with INVALID_INPUT. The entrant always comes from the session, never from here.
 */
export const RACE_BATCH_EVENT = "race:batch";
export const RACE_ABANDON_EVENT = "race:abandon";

/**
 * One typed grapheme, or a deletion. A grapheme is short (an emoji sequence stays well under
 * this bound); a line break is never typed (D-16): the client does not send Enter, and the
 * server refuses it before the engine, where it would count as a wrong grapheme.
 */
const inputEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("insert"),
      grapheme: z
        .string()
        .min(1)
        .max(64)
        .refine((grapheme) => !/[\r\n]/.test(grapheme), "Enter is never typed"),
    })
    .strict(),
  z.object({ type: z.literal("deleteBackward") }).strict(),
]);

export const keystrokeBatchPayloadSchema = z
  .object({
    raceId: z.uuid(),
    seq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    textVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    events: z.array(inputEventSchema).min(1).max(MAX_BATCH_EVENTS),
  })
  .strict();
export type KeystrokeBatchPayload = z.infer<typeof keystrokeBatchPayloadSchema>;

/** Leaving the race on purpose (COURSE-07): the reason is always `voluntary`, set by the server. */
export const abandonPayloadSchema = z.object({ raceId: z.uuid() }).strict();
