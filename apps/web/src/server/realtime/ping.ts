import { z } from "zod";

export const PING_EVENT = "system:ping";

const pingPayloadSchema = z.object({ sentAt: z.number() }).strict();

export type PingAck =
  | { readonly ok: true; readonly serverTime: number }
  | { readonly ok: false; readonly error: "INVALID_PAYLOAD" };

/** Round trip used by the smoke test to prove the realtime transport end to end. */
export function answerPing(payload: unknown, now: () => number): PingAck {
  if (!pingPayloadSchema.safeParse(payload).success) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  return { ok: true, serverTime: now() };
}
