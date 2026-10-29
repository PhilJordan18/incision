import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { guestSessions, lobbies, lobbyMembers } from "../schema";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import type { GuestSessionProof, GuestSessionRow } from "./guest-sessions";

export type GuestMemberCommandInput<Answer> = {
  readonly proof: GuestSessionProof;
  readonly lobbyId: string;
  readonly memberId: string;
  /** Synchronous server action, never client-supplied. Do not retry it after a SQL failure. */
  readonly run: () => { readonly answer: Answer; readonly activity: boolean };
};
export type GuestMemberCommandResult<Answer> = { readonly kind: "unauthorized" } |
  { readonly kind: "authorized"; readonly answer: Answer; readonly session: GuestSessionRow };

/**
 * Revalidate membership and expiry under room -> session locks, then apply one live
 * command. Only a server-confirmed accepted action updates activity. Engine state
 * is process-local: a subsequent SQL failure does not rewind it; callers suspend
 * the socket and never automatically replay the callback.
 */
export async function runGuestMemberCommand<Answer>(db: Database, input: GuestMemberCommandInput<Answer>): Promise<GuestMemberCommandResult<Answer>> {
  return boundedTransaction(db, async (tx): Promise<GuestMemberCommandResult<Answer>> => {
    const [room] = await tx.select({ phase: lobbies.phase }).from(lobbies).where(eq(lobbies.id, input.lobbyId)).for("update");
    if (room === undefined || room.phase === "closed") return { kind: "unauthorized" };
    const [session] = await tx.select({ id: guestSessions.id, expiresAt: guestSessions.expiresAt }).from(guestSessions)
      .where(and(eq(guestSessions.id, input.proof.id), eq(guestSessions.secretDigest, input.proof.secretDigest))).for("update");
    if (session === undefined) return { kind: "unauthorized" };
    const [member] = await tx.select({ id: lobbyMembers.id }).from(lobbyMembers).where(and(
      eq(lobbyMembers.id, input.memberId), eq(lobbyMembers.lobbyId, input.lobbyId),
      eq(lobbyMembers.guestSessionId, session.id), isNull(lobbyMembers.leftAt),
    ));
    const [active] = await tx.select({ id: guestSessions.id }).from(guestSessions).where(and(
      eq(guestSessions.id, session.id), gt(guestSessions.expiresAt, sql`statement_timestamp()`),
    ));
    if (member === undefined || active === undefined) return { kind: "unauthorized" };
    const { answer, activity } = input.run();
    if (!activity) return { kind: "authorized", answer, session };
    const [renewed] = await tx.update(guestSessions).set({
      lastSeenAt: sql`greatest(${guestSessions.lastSeenAt}, statement_timestamp())`,
      expiresAt: sql`greatest(${guestSessions.lastSeenAt}, statement_timestamp()) + interval '24 hours'`,
    }).where(and(eq(guestSessions.id, session.id), gt(guestSessions.expiresAt, sql`statement_timestamp()`)))
      .returning({ id: guestSessions.id, expiresAt: guestSessions.expiresAt });
    return renewed === undefined ? { kind: "unauthorized" } : { kind: "authorized", answer, session: renewed };
  }, READ_COMMITTED);
}
