import { z } from "zod";

/**
 * Room presence over Socket.IO (CP-06), shared by the browser and the server. Every
 * payload is validated with these schemas at the boundary (TECH-07).
 */
export const ROOM_WATCH_EVENT = "room:watch";
export const ROOM_SNAPSHOT_EVENT = "room:snapshot";

export const roomWatchPayloadSchema = z.object({ code: z.string().min(1).max(16) }).strict();

export type RoomPhase = "waiting" | "countdown" | "racing" | "results" | "closed";

/** What every member of a room sees; no account id, only member ids. */
export type PublicRoomSnapshot = {
  readonly code: string;
  readonly phase: RoomPhase;
  readonly capacity: number;
  readonly revision: number;
  readonly members: readonly {
    readonly memberId: string;
    readonly displayName: string;
    readonly role: "participant" | "spectator";
    readonly isHost: boolean;
    /** At least one open socket of this member right now. */
    readonly online: boolean;
  }[];
};

export type RoomWatchAck =
  | { readonly ok: true; readonly selfMemberId: string; readonly snapshot: PublicRoomSnapshot }
  | { readonly ok: false; readonly error: "INVALID_PAYLOAD" | "UNAUTHORIZED" | "NOT_A_MEMBER" | "UNAVAILABLE" };

const snapshotSchema = z.object({
  code: z.string(),
  phase: z.enum(["waiting", "countdown", "racing", "results", "closed"]),
  capacity: z.number(),
  revision: z.number(),
  members: z.array(
    z.object({
      memberId: z.string(),
      displayName: z.string(),
      role: z.enum(["participant", "spectator"]),
      isHost: z.boolean(),
      online: z.boolean(),
    }),
  ),
});

/** The browser validates what the server sends, too. */
export const roomWatchAckSchema = z.union([
  z.object({ ok: z.literal(true), selfMemberId: z.string(), snapshot: snapshotSchema }),
  z.object({ ok: z.literal(false), error: z.enum(["INVALID_PAYLOAD", "UNAUTHORIZED", "NOT_A_MEMBER", "UNAVAILABLE"]) }),
]);
export const roomSnapshotSchema = snapshotSchema;
