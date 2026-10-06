import { canonicalDisplayName, DISPLAY_NAME_MAX_LENGTH, type RoomCode } from "@incision/domain";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { uniqueViolationOf } from "../errors";
import { firstRow } from "../rows";
import { accounts, lobbies, lobbyMembers } from "../schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Queryable = Database | Transaction;

export type MemberRole = "participant" | "spectator";

/** The room an account currently occupies (one at most, SALLE-06). */
export type ActiveMembership = { readonly lobbyId: string; readonly code: string; readonly memberId: string };

export async function findActiveMembership(db: Queryable, accountId: string): Promise<ActiveMembership | undefined> {
  const [row] = await db
    .select({ lobbyId: lobbyMembers.lobbyId, code: lobbies.code, memberId: lobbyMembers.id })
    .from(lobbyMembers)
    .innerJoin(lobbies, eq(lobbies.id, lobbyMembers.lobbyId))
    .where(and(eq(lobbyMembers.accountId, accountId), isNull(lobbyMembers.leftAt)));
  return row;
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

export type RoomSnapshot = {
  readonly lobbyId: string;
  readonly code: string;
  readonly phase: "waiting" | "countdown" | "racing" | "results" | "closed";
  readonly capacity: number;
  /** Increases with every change of membership: clients keep the newest snapshot. */
  readonly revision: number;
  /** Active members, oldest first. */
  readonly members: readonly RoomMember[];
};

/** Room and its active members in two indexed queries (no query per member). */
export async function readRoomSnapshot(db: Queryable, lobbyId: string): Promise<RoomSnapshot | undefined> {
  const [lobby] = await db
    .select({ code: lobbies.code, phase: lobbies.phase, capacity: lobbies.capacity, revision: lobbies.revision, hostMemberId: lobbies.hostMemberId })
    .from(lobbies)
    .where(eq(lobbies.id, lobbyId));
  if (lobby === undefined) {
    return undefined;
  }
  const members = await db
    .select({
      memberId: lobbyMembers.id,
      accountId: lobbyMembers.accountId,
      displayName: lobbyMembers.displayName,
      role: lobbyMembers.role,
    })
    .from(lobbyMembers)
    .where(and(eq(lobbyMembers.lobbyId, lobbyId), isNull(lobbyMembers.leftAt)))
    .orderBy(asc(lobbyMembers.joinedAt), asc(lobbyMembers.id));
  return {
    lobbyId,
    code: lobby.code,
    phase: lobby.phase,
    capacity: lobby.capacity,
    revision: lobby.revision,
    members: members.map((member) => ({ ...member, isHost: member.memberId === lobby.hostMemberId })),
  };
}

export type JoinRoomInput = { readonly accountId: string; readonly code: RoomCode; readonly role: MemberRole };

export type JoinRoomResult =
  | { readonly ok: true; readonly lobbyId: string; readonly memberId: string; readonly alreadyMember: boolean }
  | { readonly ok: false; readonly error: "ROOM_NOT_FOUND" | "ROOM_NOT_ADMITTING" | "ROOM_FULL" | "ACCOUNT_NOT_FOUND" }
  | { readonly ok: false; readonly error: "ALREADY_IN_ANOTHER_ROOM"; readonly currentCode: string };

/**
 * Admits an account into the room of `code` (JOIN-01, SALLE-05/06/09). The room row is
 * locked, so the capacity count and the local display-name choice hold under concurrent
 * joins. Joining the room one already occupies (a second tab) returns the same member.
 * Spectators do not count against the capacity. A private room refuses the code alone.
 */
export async function joinRoomByCode(db: Database, input: JoinRoomInput): Promise<JoinRoomResult> {
  try {
    return await db.transaction((tx) => admit(tx, input));
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
  const [lobby] = await tx
    .select({ id: lobbies.id, phase: lobbies.phase, visibility: lobbies.visibility, capacity: lobbies.capacity })
    .from(lobbies)
    .where(eq(lobbies.code, code))
    .for("update");
  if (lobby === undefined || lobby.visibility === "private") {
    return { ok: false, error: "ROOM_NOT_FOUND" };
  }
  const current = await findActiveMembership(tx, accountId);
  if (current !== undefined) {
    return current.lobbyId === lobby.id
      ? { ok: true, lobbyId: lobby.id, memberId: current.memberId, alreadyMember: true }
      : { ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: current.code };
  }
  // Admissions only while waiting or at results (SALLE-09); a closed room admits nobody.
  if (lobby.phase !== "waiting" && lobby.phase !== "results") {
    return { ok: false, error: "ROOM_NOT_ADMITTING" };
  }
  if (role === "participant") {
    const participants = firstRow(
      await tx
        .select({ value: count() })
        .from(lobbyMembers)
        .where(and(eq(lobbyMembers.lobbyId, lobby.id), eq(lobbyMembers.role, "participant"), isNull(lobbyMembers.leftAt))),
    ).value;
    if (participants >= lobby.capacity) {
      return { ok: false, error: "ROOM_FULL" };
    }
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
      .values({ lobbyId: lobby.id, accountId, role, displayName, displayNameCanonical: canonicalDisplayName(displayName) })
      .returning({ id: lobbyMembers.id }),
  );
  await bumpRevision(tx, lobby.id);
  return { ok: true, lobbyId: lobby.id, memberId: member.id, alreadyMember: false };
}

/**
 * The account's name, or "name 2", "name 3"… when another active member of the room
 * already uses it (D-04): the account's own display name is never changed.
 */
export function localDisplayName(displayName: string, takenCanonical: ReadonlySet<string>): string {
  if (!takenCanonical.has(canonicalDisplayName(displayName))) {
    return displayName;
  }
  for (let suffix = 2; ; suffix += 1) {
    const tail = ` ${suffix}`;
    const candidate = `${[...displayName].slice(0, DISPLAY_NAME_MAX_LENGTH - tail.length).join("").trimEnd()}${tail}`;
    if (!takenCanonical.has(canonicalDisplayName(candidate))) {
      return candidate;
    }
  }
}

export type LeaveRoomResult = { readonly lobbyId: string; readonly closed: boolean };

/**
 * The account leaves its current room. At the checkpoint, the host leaving closes the
 * room (host succession comes with SALLE-08): every remaining member leaves with it, in
 * the same transaction, so nobody stays blocked by the one-active-room index.
 */
export async function leaveCurrentRoom(db: Database, accountId: string): Promise<LeaveRoomResult | undefined> {
  return db.transaction(async (tx) => {
    const current = await findActiveMembership(tx, accountId);
    if (current === undefined) {
      return undefined;
    }
    const [lobby] = await tx
      .select({ hostMemberId: lobbies.hostMemberId })
      .from(lobbies)
      .where(eq(lobbies.id, current.lobbyId))
      .for("update");
    const closesRoom = lobby?.hostMemberId === current.memberId;
    if (closesRoom) {
      await tx
        .update(lobbyMembers)
        .set({ leftAt: sql`now()` })
        .where(and(eq(lobbyMembers.lobbyId, current.lobbyId), isNull(lobbyMembers.leftAt)));
      await tx.update(lobbies).set({ phase: "closed", closedAt: sql`now()` }).where(eq(lobbies.id, current.lobbyId));
    } else {
      await tx.update(lobbyMembers).set({ leftAt: sql`now()` }).where(eq(lobbyMembers.id, current.memberId));
    }
    await bumpRevision(tx, current.lobbyId);
    return { lobbyId: current.lobbyId, closed: closesRoom };
  });
}

async function bumpRevision(tx: Transaction, lobbyId: string): Promise<void> {
  await tx
    .update(lobbies)
    .set({ revision: sql`${lobbies.revision} + 1` })
    .where(eq(lobbies.id, lobbyId));
}
