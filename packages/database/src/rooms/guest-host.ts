import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { GuestSessionProof } from "../identity/guest-sessions";
import { guestSessions, lobbies, lobbyMembers, lobbySettings } from "../schema";
import type { Queryable, Transaction } from "../transaction";
import { type OwnRoomSettings, settingsColumns, settingsOf } from "./settings";

/** Read-only draw input, never a substitute for the start transaction's authorization. */
export async function readGuestRoomSettings(db: Queryable, proof: GuestSessionProof): Promise<OwnRoomSettings | undefined> {
  const [row] = await db.select({ lobbyId: lobbies.id, phase: lobbies.phase,
    hostMemberId: lobbies.hostMemberId, memberId: lobbyMembers.id, ...settingsColumns,
  }).from(lobbyMembers).innerJoin(lobbies, eq(lobbies.id, lobbyMembers.lobbyId))
    .innerJoin(guestSessions, eq(guestSessions.id, lobbyMembers.guestSessionId))
    .leftJoin(lobbySettings, eq(lobbySettings.lobbyId, lobbies.id))
    .where(and(eq(guestSessions.id, proof.id), eq(guestSessions.secretDigest, proof.secretDigest),
      gt(guestSessions.expiresAt, sql`statement_timestamp()`), isNull(lobbyMembers.leftAt)));
  return row === undefined ? undefined : {
    lobbyId: row.lobbyId, phase: row.phase, isHost: row.hostMemberId === row.memberId, settings: settingsOf(row),
  };
}

/** Caller holds the room lock. Lock identity before sampling expiry, never resurrect it. */
export async function lockLiveGuest(tx: Transaction, proof: GuestSessionProof): Promise<boolean> {
  const [locked] = await tx.select({ id: guestSessions.id }).from(guestSessions)
    .where(and(eq(guestSessions.id, proof.id), eq(guestSessions.secretDigest, proof.secretDigest))).for("update");
  if (locked === undefined) return false;
  const [live] = await tx.select({ id: guestSessions.id }).from(guestSessions)
    .where(and(eq(guestSessions.id, proof.id), gt(guestSessions.expiresAt, sql`statement_timestamp()`)));
  return live !== undefined;
}

/** Only after a successful host mutation, inside the same locked transaction. */
export async function renewGuestAfterHostAction(tx: Transaction, id: string) {
  const [session] = await tx.update(guestSessions).set({
    lastSeenAt: sql`greatest(${guestSessions.lastSeenAt}, statement_timestamp())`,
    expiresAt: sql`greatest(${guestSessions.lastSeenAt}, statement_timestamp()) + interval '24 hours'`,
  }).where(and(eq(guestSessions.id, id), gt(guestSessions.expiresAt, sql`statement_timestamp()`)))
    .returning({ id: guestSessions.id, expiresAt: guestSessions.expiresAt });
  // Roll back the entire host action if the identity expired during its work.
  if (session === undefined) throw new Error("Guest expired during host action");
  return session;
}
