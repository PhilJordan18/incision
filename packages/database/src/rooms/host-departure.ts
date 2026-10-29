import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { guestSessions, lobbies, lobbyMembers } from "../schema";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import { interruptRaceForClosedRoom } from "../races/interruption";
import { bumpRevision, closeLockedRoom } from "./room-writes";
import { transferHostToConnectedMember } from "./succession";

export type HostPresenceState = { readonly expired: boolean; readonly expiresAt: number };
export type HostDepartureResult = { readonly kind: "gone" } | { readonly kind: "not-host" } |
  ({ readonly kind: "retained" } & HostPresenceState) |
  { readonly kind: "departed"; readonly closed: boolean; readonly accountId: string | null };
export type HostDepartureInput = {
  readonly lobbyId: string;
  readonly memberId: string;
  readonly claim: (state: HostPresenceState) => boolean;
  readonly online: (lobbyId: string) => ReadonlySet<string>;
};

/** Server-only timeout: lock the room before sampling current host and live presence. */
export async function endDisconnectedHostPresence(db: Database, input: HostDepartureInput): Promise<HostDepartureResult> {
  return boundedTransaction(db, async (tx): Promise<HostDepartureResult> => {
    const [room] = await tx.select().from(lobbies).where(eq(lobbies.id, input.lobbyId)).for("update");
    if (room === undefined || room.phase === "closed") return { kind: "gone" };
    const [member] = await tx.select().from(lobbyMembers).where(and(
      eq(lobbyMembers.id, input.memberId), eq(lobbyMembers.lobbyId, input.lobbyId), isNull(lobbyMembers.leftAt),
    ));
    if (member === undefined) return { kind: "gone" };
    if (room.hostMemberId !== member.id) return { kind: "not-host" };
    let state: HostPresenceState = { expired: false, expiresAt: Number.POSITIVE_INFINITY };
    if (member.guestSessionId !== null) {
      await tx.select({ id: guestSessions.id }).from(guestSessions)
        .where(eq(guestSessions.id, member.guestSessionId)).for("update");
      const [session] = await tx.select({ expiresAt: guestSessions.expiresAt,
        expired: sql<boolean>`${guestSessions.expiresAt} <= statement_timestamp()`,
      }).from(guestSessions).where(eq(guestSessions.id, member.guestSessionId));
      if (session === undefined) return { kind: "gone" };
      state = { expired: session.expired, expiresAt: session.expiresAt.getTime() };
    }
    if (!input.claim(state)) return { kind: "retained", ...state };
    const transferred = await transferHostToConnectedMember(tx, {
      lobbyId: input.lobbyId, outgoingHostId: member.id, online: input.online,
    });
    if (!transferred) {
      if (room.currentRaceId !== null) await interruptRaceForClosedRoom(tx, room.currentRaceId);
      await closeLockedRoom(tx, input.lobbyId);
      // Release the composite FK before erasing the departing guest's live name.
      await tx.update(lobbies).set({ hostMemberId: null }).where(eq(lobbies.id, input.lobbyId));
    }
    if (member.guestSessionId !== null) {
      await tx.delete(lobbyMembers).where(eq(lobbyMembers.id, member.id));
    } else if (transferred) {
      await tx.update(lobbyMembers).set({ leftAt: sql`statement_timestamp()` }).where(eq(lobbyMembers.id, member.id));
    }
    await bumpRevision(tx, input.lobbyId);
    return { kind: "departed", closed: !transferred, accountId: member.accountId };
  }, READ_COMMITTED);
}
