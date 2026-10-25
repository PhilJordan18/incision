import {
  type AdmissionRefusal,
  type AdmittingPhase,
  admissionRefusal,
  admitsNewMembers,
  canonicalDisplayName,
  localDisplayName,
  type MemberRole,
  type RoomCode,
  type RoomPhase,
} from "@incision/domain";
import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import { uniqueViolationOf } from "../errors";
import { interruptRaceForClosedRoom } from "../races/interruption";
import { firstRow } from "../rows";
import { accounts, type InterruptionReason, lobbies, lobbyMembers, type RACE_STATES, races } from "../schema";
import { boundedTransaction, type Queryable, READ_COMMITTED, type Transaction } from "../transaction";
import { bumpRevision, closeLockedRoom } from "./room-writes";

/** The room an account currently occupies (one at most, SALLE-06). */
export type ActiveMembership = {
  readonly lobbyId: string;
  readonly code: string;
  readonly memberId: string;
  /** Leaving closes the room at the checkpoint (SALLE-08 comes later). */
  readonly isHost: boolean;
};

export async function findActiveMembership(db: Queryable, accountId: string): Promise<ActiveMembership | undefined> {
  const [row] = await db
    .select({ lobbyId: lobbyMembers.lobbyId, code: lobbies.code, memberId: lobbyMembers.id, hostMemberId: lobbies.hostMemberId })
    .from(lobbyMembers)
    .innerJoin(lobbies, eq(lobbies.id, lobbyMembers.lobbyId))
    .where(and(eq(lobbyMembers.accountId, accountId), isNull(lobbyMembers.leftAt)));
  return row === undefined
    ? undefined
    : { lobbyId: row.lobbyId, code: row.code, memberId: row.memberId, isHost: row.hostMemberId === row.memberId };
}

/** A room that admits by code: not private, whatever its phase. */
export async function findRoomByCode(
  db: Queryable,
  code: RoomCode,
): Promise<{ readonly lobbyId: string; readonly phase: RoomSnapshot["phase"] } | undefined> {
  const [row] = await db
    .select({ lobbyId: lobbies.id, phase: lobbies.phase, visibility: lobbies.visibility })
    .from(lobbies)
    .where(eq(lobbies.code, code));
  return row === undefined || row.visibility === "private" ? undefined : { lobbyId: row.lobbyId, phase: row.phase };
}

export type RoomMember = {
  readonly memberId: string;
  readonly accountId: string;
  readonly displayName: string;
  readonly role: MemberRole;
  readonly isHost: boolean;
};

/** The room's current (or latest) race, as the database holds it: what a page shows after a reconnection. */
export type RoomRace = {
  readonly raceId: string;
  readonly state: (typeof RACE_STATES)[number];
  readonly interruptionReason: InterruptionReason | null;
};

export type RoomSnapshot = {
  readonly lobbyId: string;
  readonly code: string;
  readonly phase: RoomPhase;
  readonly capacity: number;
  /** Increases with every change of membership: clients keep the newest snapshot. */
  readonly revision: number;
  /** Active members, oldest first. */
  readonly members: readonly RoomMember[];
  /** Kept once the room goes back to waiting, so its members learn how that race ended. */
  readonly race?: RoomRace;
};

/**
 * Room and its active members in one statement, so the revision and the members come
 * from the same snapshot (no query per member).
 */
export async function readRoomSnapshot(db: Queryable, lobbyId: string): Promise<RoomSnapshot | undefined> {
  const rows = await db
    .select({
      code: lobbies.code,
      phase: lobbies.phase,
      capacity: lobbies.capacity,
      revision: lobbies.revision,
      hostMemberId: lobbies.hostMemberId,
      memberId: lobbyMembers.id,
      accountId: lobbyMembers.accountId,
      displayName: lobbyMembers.displayName,
      role: lobbyMembers.role,
      raceId: races.id,
      raceState: races.state,
      interruptionReason: races.interruptionReason,
    })
    .from(lobbies)
    .leftJoin(races, eq(races.id, lobbies.currentRaceId))
    .leftJoin(lobbyMembers, and(eq(lobbyMembers.lobbyId, lobbies.id), isNull(lobbyMembers.leftAt)))
    .where(eq(lobbies.id, lobbyId))
    .orderBy(asc(lobbyMembers.joinedAt), asc(lobbyMembers.id));
  const [lobby] = rows;
  if (lobby === undefined) {
    return undefined;
  }
  const members: RoomMember[] = [];
  for (const row of rows) {
    if (row.memberId !== null && row.accountId !== null && row.displayName !== null && row.role !== null) {
      const { memberId, accountId, displayName, role } = row;
      members.push({ memberId, accountId, displayName, role, isHost: memberId === lobby.hostMemberId });
    }
  }
  const race =
    lobby.raceId === null || lobby.raceState === null
      ? undefined
      : { raceId: lobby.raceId, state: lobby.raceState, interruptionReason: lobby.interruptionReason };
  return { lobbyId, code: lobby.code, phase: lobby.phase, capacity: lobby.capacity, revision: lobby.revision, members, ...(race === undefined ? {} : { race }) };
}

export type JoinRoomInput = { readonly accountId: string; readonly code: RoomCode; readonly role: MemberRole };

export type JoinRoomResult =
  | { readonly ok: true; readonly lobbyId: string; readonly memberId: string; readonly alreadyMember: boolean }
  | { readonly ok: false; readonly error: "ROOM_NOT_FOUND" | "ROOM_FULL" | "SPECTATORS_FULL" | "ACCOUNT_NOT_FOUND" }
  /** The phase tells a closed room from a race in progress (the code limit counts only the first). */
  | { readonly ok: false; readonly error: "ROOM_NOT_ADMITTING"; readonly phase: Exclude<RoomPhase, AdmittingPhase> }
  | { readonly ok: false; readonly error: "ALREADY_IN_ANOTHER_ROOM"; readonly currentCode: string };

/**
 * Admits an account into the room of `code` (JOIN-01, SALLE-05/06/09). The room row is
 * locked, so the capacity count and the local display-name choice hold under concurrent
 * joins. Joining the room one already occupies (a second tab) returns the same member.
 * Spectators do not count against the capacity. A private room refuses the code alone.
 */
export async function joinRoomByCode(db: Database, input: JoinRoomInput): Promise<JoinRoomResult> {
  try {
    return await boundedTransaction(db, (tx) => admit(tx, input), READ_COMMITTED);
  } catch (error: unknown) {
    // A concurrent join of the same account into another room won the unique index.
    if (uniqueViolationOf(error) === "lobby_members_active_account_unique") {
      const current = await findActiveMembership(db, input.accountId);
      if (current !== undefined) {
        return { ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: current.code };
      }
    }
    throw error;
  }
}

async function admit(tx: Transaction, { accountId, code, role }: JoinRoomInput): Promise<JoinRoomResult> {
  // A private room is never locked by a code alone: it answers exactly like an unknown code,
  // without the lock's cost that could tell the two apart (SALLE-03, SALLE-10).
  const [lobby] = await tx
    .select({ id: lobbies.id, phase: lobbies.phase, capacity: lobbies.capacity })
    .from(lobbies)
    .where(and(eq(lobbies.code, code), ne(lobbies.visibility, "private")))
    .for("update");
  if (lobby === undefined) {
    return { ok: false, error: "ROOM_NOT_FOUND" };
  }
  const current = await findActiveMembership(tx, accountId);
  if (current !== undefined) {
    return current.lobbyId === lobby.id
      ? { ok: true, lobbyId: lobby.id, memberId: current.memberId, alreadyMember: true }
      : { ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: current.code };
  }
  // The lobby row lock serializes admissions and departures. Count only the requested
  // role, independently of the other quota; existing membership was returned above.
  const activeInRole = firstRow(
    await tx
      .select({ value: count() })
      .from(lobbyMembers)
      .where(and(eq(lobbyMembers.lobbyId, lobby.id), eq(lobbyMembers.role, role), isNull(lobbyMembers.leftAt))),
  ).value;
  const refusal = admissionRefusal({
    phase: lobby.phase,
    role,
    activeParticipants: role === "participant" ? activeInRole : 0,
    activeSpectators: role === "spectator" ? activeInRole : 0,
    capacity: lobby.capacity,
  });
  if (refusal !== undefined) {
    return admissionRefusalResult(refusal, lobby.phase);
  }
  const [account] = await tx.select({ displayName: accounts.displayName }).from(accounts).where(eq(accounts.id, accountId));
  if (account === undefined) {
    return { ok: false, error: "ACCOUNT_NOT_FOUND" };
  }
  const taken = await tx
    .select({ canonical: lobbyMembers.displayNameCanonical })
    .from(lobbyMembers)
    .where(and(eq(lobbyMembers.lobbyId, lobby.id), isNull(lobbyMembers.leftAt)));
  const displayName = localDisplayName(account.displayName, new Set(taken.map((row) => row.canonical)));
  const member = firstRow(
    await tx
      .insert(lobbyMembers)
      .values({
        lobbyId: lobby.id,
        accountId,
        role,
        displayName,
        displayNameCanonical: canonicalDisplayName(displayName),
        // Admission time, under the room lock: seniority follows the real order (SALLE-08).
        joinedAt: sql`statement_timestamp()`,
      })
      .returning({ id: lobbyMembers.id }),
  );
  await bumpRevision(tx, lobby.id);
  return { ok: true, lobbyId: lobby.id, memberId: member.id, alreadyMember: false };
}

/** Every refusal stops the admission; the phase tells a closed room from a race in progress. */
function admissionRefusalResult(refusal: AdmissionRefusal, phase: RoomPhase): JoinRoomResult & { readonly ok: false } {
  switch (refusal) {
    case "ROOM_FULL":
    case "SPECTATORS_FULL":
      return { ok: false, error: refusal };
    case "ROOM_NOT_ADMITTING":
      // The domain refuses admission exactly in these phases; a mismatch still refuses.
      return admitsNewMembers(phase) ? { ok: false, error: "ROOM_FULL" } : { ok: false, error: "ROOM_NOT_ADMITTING", phase };
  }
}

export type LeaveRoomResult = { readonly lobbyId: string; readonly closed: boolean };

/**
 * The account leaves its current room. At the checkpoint, the host leaving closes the
 * room (host succession comes with SALLE-08): every remaining member leaves with it, in
 * the same transaction, so nobody stays blocked by the one-active-room index.
 *
 * The membership is read again under the room lock: a second tab, or the host closing
 * the room meanwhile, may already have ended it. Departure times are taken after the
 * lock (`statement_timestamp()`), so they never precede a join committed just before.
 */
export async function leaveCurrentRoom(db: Database, accountId: string): Promise<LeaveRoomResult | undefined> {
  // It may interrupt a race: bounded on the server like every transaction.
  return boundedTransaction(db, async (tx) => {
    const seen = await findActiveMembership(tx, accountId);
    if (seen === undefined) {
      return undefined;
    }
    const [lobby] = await tx
      .select({ hostMemberId: lobbies.hostMemberId, phase: lobbies.phase, currentRaceId: lobbies.currentRaceId })
      .from(lobbies)
      .where(eq(lobbies.id, seen.lobbyId))
      .for("update");
    const current = await findActiveMembership(tx, accountId);
    if (lobby === undefined || current?.memberId !== seen.memberId) {
      return undefined;
    }
    const closesRoom = lobby.hostMemberId === current.memberId;
    if (closesRoom && lobby.currentRaceId !== null && (lobby.phase === "countdown" || lobby.phase === "racing")) {
      // No succession yet (SALLE-08): the race ends with the room, without results (D-06).
      await interruptRaceForClosedRoom(tx, lobby.currentRaceId);
    }
    if (closesRoom) {
      await closeLockedRoom(tx, current.lobbyId);
    } else {
      await tx
        .update(lobbyMembers)
        .set({ leftAt: sql`statement_timestamp()` })
        .where(and(eq(lobbyMembers.id, current.memberId), isNull(lobbyMembers.leftAt)));
    }
    await bumpRevision(tx, current.lobbyId);
    return { lobbyId: current.lobbyId, closed: closesRoom };
  }, READ_COMMITTED);
}
