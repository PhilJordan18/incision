import { and, eq, isNull, sql } from "drizzle-orm";
import type { RoomPhase } from "@incision/domain";
import type { Database } from "../client";
import { guestSessions, lobbies, lobbyMembers } from "../schema";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import { bumpRevision } from "./room-writes";

export type GuestPresenceState = { readonly phase: RoomPhase; readonly expired: boolean; readonly expiresAt: number };
export type GuestDepartureResult = { readonly kind: "departed" } | { readonly kind: "gone" } | { readonly kind: "host" } |
  ({ readonly kind: "retained" } & GuestPresenceState);
export type GuestDepartureInput = {
  readonly lobbyId: string;
  readonly memberId: string;
  /** Server timer only: sample live presence after locks/reads, never a client claim. */
  readonly claim: (state: GuestPresenceState) => boolean;
};

/**
 * Non-host guest departure only. Room -> session lock order matches admission. The
 * synchronous claim is the linearization point: the caller holds reconnects until
 * this transaction settles once it claims. No host succession or account policy.
 */
export async function endDisconnectedGuestPresence(db: Database, input: GuestDepartureInput): Promise<GuestDepartureResult> {
  return boundedTransaction(db, async (tx): Promise<GuestDepartureResult> => {
    const [room] = await tx.select({ phase: lobbies.phase, host: lobbies.hostMemberId }).from(lobbies)
      .where(eq(lobbies.id, input.lobbyId)).for("update");
    const [member] = await tx.select({ guestId: lobbyMembers.guestSessionId }).from(lobbyMembers).where(and(
      eq(lobbyMembers.id, input.memberId), eq(lobbyMembers.lobbyId, input.lobbyId), isNull(lobbyMembers.leftAt),
    ));
    if (room === undefined || member?.guestId == null) return { kind: "gone" };
    if (room.host === input.memberId) return { kind: "host" };
    // Renewal and cross-room admission cannot race the expiry decision.
    await tx.select({ id: guestSessions.id }).from(guestSessions).where(eq(guestSessions.id, member.guestId)).for("update");
    const [session] = await tx.select({ expiresAt: guestSessions.expiresAt,
      expired: sql<boolean>`${guestSessions.expiresAt} <= statement_timestamp()`,
    }).from(guestSessions).where(eq(guestSessions.id, member.guestId));
    if (session === undefined) return { kind: "gone" };
    const state = { phase: room.phase, expired: session.expired, expiresAt: session.expiresAt.getTime() };
    // Expiry takes precedence in every phase. Otherwise only outside-race grace
    // can end membership here; the race engine retains its own D-06 authority.
    if ((!state.expired && state.phase !== "waiting" && state.phase !== "results") || !input.claim(state)) {
      return { kind: "retained", ...state };
    }
    // Guest entrants already persist no member FK or name (0014). Remove the live
    // name/reference rather than retaining a guest membership history.
    await tx.delete(lobbyMembers).where(eq(lobbyMembers.id, input.memberId));
    await bumpRevision(tx, input.lobbyId);
    return { kind: "departed" };
  }, READ_COMMITTED);
}
