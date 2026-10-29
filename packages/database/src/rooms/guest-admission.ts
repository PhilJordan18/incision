import { admissionRefusal, canonicalDisplayName, parseGuestNickname, type MemberRole, type RoomCode } from "@incision/domain";
import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { GuestSessionProof } from "../identity/guest-sessions";
import { guestSessions, lobbies, lobbyBots, lobbyMembers } from "../schema";
import { boundedTransaction, READ_COMMITTED, type Transaction } from "../transaction";
import { findActiveHumanMembership, type JoinRoomResult } from "./membership";
import { bumpRevision } from "./room-writes";

export type GuestAdmissionInput = {
  /** Derived from a verified signed cookie by the server, never from a request body. */
  readonly proof: GuestSessionProof;
  readonly code: RoomCode;
  readonly role: MemberRole;
  readonly nickname: string;
};

export type GuestAdmissionResult = Exclude<JoinRoomResult, { readonly error: "ROOM_NOT_FOUND" | "ROOM_FULL" | "SPECTATORS_FULL" | "ACCOUNT_NOT_FOUND" }>
  | { readonly ok: false; readonly error: "ROOM_NOT_FOUND" | "ROOM_FULL" | "SPECTATORS_FULL" }
  | { readonly ok: false; readonly error: "INVALID_GUEST_SESSION" | "INVALID_GUEST_NICKNAME" | "NICKNAME_TAKEN" };

/**
 * Internal foundation only: no HTTP action calls this yet. Lock order is room, then
 * guest session. The session lock serializes admissions across different rooms and
 * protects the proof from concurrent deletion/renewal. Never renews or creates identity.
 */
export async function joinRoomByCodeAsGuest(db: Database, input: GuestAdmissionInput): Promise<GuestAdmissionResult> {
  const nickname = parseGuestNickname(input.nickname);
  if (!nickname.ok) return nickname;
  return boundedTransaction(db, async (tx): Promise<GuestAdmissionResult> => {
    // Private rooms have the same response and avoid the row lock, as for accounts.
    const [room] = await tx.select({ id: lobbies.id, phase: lobbies.phase, capacity: lobbies.capacity })
      .from(lobbies).where(and(eq(lobbies.code, input.code), ne(lobbies.visibility, "private"))).for("update");
    if (room === undefined) return { ok: false, error: "ROOM_NOT_FOUND" };
    const [session] = await tx.select({ id: guestSessions.id }).from(guestSessions)
      .where(and(eq(guestSessions.id, input.proof.id), eq(guestSessions.secretDigest, input.proof.secretDigest))).for("update");
    if (session === undefined || !await sessionIsActive(tx, session.id)) return { ok: false, error: "INVALID_GUEST_SESSION" };
    const current = await findActiveHumanMembership(tx, { kind: "guest", guestSessionId: session.id });
    if (current !== undefined) {
      return current.lobbyId === room.id
        ? { ok: true, lobbyId: room.id, memberId: current.memberId, alreadyMember: true }
        : { ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: current.code };
    }
    const [humans] = await tx.select({ value: count() }).from(lobbyMembers).where(and(
      eq(lobbyMembers.lobbyId, room.id), eq(lobbyMembers.role, input.role), isNull(lobbyMembers.leftAt),
    ));
    const [bots] = input.role === "participant"
      ? await tx.select({ value: count() }).from(lobbyBots).where(eq(lobbyBots.lobbyId, room.id)) : [];
    const refusal = admissionRefusal({ phase: room.phase, role: input.role, capacity: room.capacity,
      activeParticipants: input.role === "participant" ? (humans?.value ?? 0) + (bots?.value ?? 0) : 0,
      activeSpectators: input.role === "spectator" ? humans?.value ?? 0 : 0 });
    if (refusal === "ROOM_NOT_ADMITTING") {
      if (room.phase === "waiting" || room.phase === "results") throw new Error("Inconsistent admission phase");
      return { ok: false, error: refusal, phase: room.phase };
    }
    if (refusal !== undefined) return { ok: false, error: refusal };
    const canonical = canonicalDisplayName(nickname.value);
    const [occupied] = await tx.select({ id: lobbyMembers.id }).from(lobbyMembers).where(and(
      eq(lobbyMembers.lobbyId, room.id), eq(lobbyMembers.displayNameCanonical, canonical), isNull(lobbyMembers.leftAt),
    ));
    if (occupied !== undefined) return { ok: false, error: "NICKNAME_TAKEN" };
    // Sample the database clock again after all admission reads; no stale pre-lock expiry.
    if (!await sessionIsActive(tx, session.id)) return { ok: false, error: "INVALID_GUEST_SESSION" };
    const [member] = await tx.insert(lobbyMembers).values({ lobbyId: room.id, guestSessionId: session.id,
      role: input.role, displayName: nickname.value, displayNameCanonical: canonical,
      joinedAt: sql`statement_timestamp()` }).returning({ id: lobbyMembers.id });
    if (member === undefined) throw new Error("Guest admission did not insert a member");
    await bumpRevision(tx, room.id);
    return { ok: true, lobbyId: room.id, memberId: member.id, alreadyMember: false };
  }, READ_COMMITTED);
}

async function sessionIsActive(tx: Transaction, id: string): Promise<boolean> {
  const [row] = await tx.select({ active: sql<boolean>`${guestSessions.expiresAt} > statement_timestamp()` })
    .from(guestSessions).where(eq(guestSessions.id, id));
  return row?.active === true;
}
