import { MEMBER_ROLES, ROOM_PHASES } from "@incision/domain";
import { z } from "zod";

/**
 * Room presence over Socket.IO (CP-06), shared by the browser and the server. Every
 * payload is validated with these schemas at the boundary (TECH-07).
 */
export const ROOM_WATCH_EVENT = "room:watch";
export const ROOM_SNAPSHOT_EVENT = "room:snapshot";

export const roomWatchPayloadSchema = z.object({ code: z.string().min(1).max(16) }).strict();

/** What every member of a room sees; no account id, only member ids. */
export const roomSnapshotSchema = z.object({
  code: z.string(),
  phase: z.enum(ROOM_PHASES),
  capacity: z.number(),
  revision: z.number(),
  members: z.array(
    z.object({
      memberId: z.string(),
      displayName: z.string(),
      role: z.enum(MEMBER_ROLES),
      isHost: z.boolean(),
      /** At least one open socket of this member right now. */
      online: z.boolean(),
    }),
  ),
});
export type PublicRoomSnapshot = z.infer<typeof roomSnapshotSchema>;

export const ROOM_WATCH_ERRORS = ["INVALID_PAYLOAD", "UNAUTHORIZED", "NOT_A_MEMBER", "RATE_LIMITED", "UNAVAILABLE"] as const;

/** The browser validates what the server sends, too. */
export const roomWatchAckSchema = z.union([
  z.object({ ok: z.literal(true), selfMemberId: z.string(), snapshot: roomSnapshotSchema }),
  z.object({ ok: z.literal(false), error: z.enum(ROOM_WATCH_ERRORS) }),
]);
export type RoomWatchAck = z.infer<typeof roomWatchAckSchema>;
