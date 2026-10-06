import { canonicalDisplayName, generateRoomCode, type RandomIndex, type RoomCode } from "@incision/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { uniqueViolationOf } from "../errors";
import { firstRow } from "../rows";
import { accounts, lobbies, lobbyMembers } from "../schema";

export const ROOM_CODE_ATTEMPTS = 5;

export type CreateRoomInput = {
  readonly accountId: string;
  readonly role: "participant" | "spectator";
  readonly visibility: "public" | "code" | "private";
  readonly capacity: number;
  /** Must be a CSPRNG in production (`crypto.randomInt`), see generateRoomCode. */
  readonly randomIndex: RandomIndex;
};

export type CreatedRoom = { readonly id: string; readonly code: RoomCode; readonly hostMemberId: string };

export type CreateRoomResult =
  | { readonly ok: true; readonly room: CreatedRoom }
  | { readonly ok: false; readonly error: "ALREADY_IN_ROOM" | "ACCOUNT_NOT_FOUND" | "CODE_ATTEMPTS_EXHAUSTED" };

/**
 * Creates a room, its creator's membership and the host link atomically (SALLE-01/02/06).
 * A unique violation aborts the PostgreSQL transaction, so a code collision retries the
 * whole transaction with a new code, a bounded number of times. "Already in a room" is
 * detected by the database constraint, which also covers concurrent requests.
 */
export async function createRoomWithHost(
  db: Database,
  input: CreateRoomInput,
  attempts: number = ROOM_CODE_ATTEMPTS,
): Promise<CreateRoomResult> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const code = generateRoomCode(input.randomIndex);
    try {
      return await db.transaction((tx) => insertRoom(tx, input, code));
    } catch (error: unknown) {
      const constraint = uniqueViolationOf(error);
      if (constraint === "lobbies_code_unique") {
        continue;
      }
      if (constraint === "lobby_members_active_account_unique") {
        return { ok: false, error: "ALREADY_IN_ROOM" };
      }
      throw error;
    }
  }
  return { ok: false, error: "CODE_ATTEMPTS_EXHAUSTED" };
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function insertRoom(tx: Transaction, input: CreateRoomInput, code: RoomCode): Promise<CreateRoomResult> {
  const [account] = await tx
    .select({ displayName: accounts.displayName })
    .from(accounts)
    .where(eq(accounts.id, input.accountId));
  if (!account) {
    return { ok: false, error: "ACCOUNT_NOT_FOUND" };
  }

  const lobby = firstRow(
    await tx
      .insert(lobbies)
      .values({ code, visibility: input.visibility, capacity: input.capacity })
      .returning({ id: lobbies.id }),
  );
  const member = firstRow(
    await tx
      .insert(lobbyMembers)
      .values({
        lobbyId: lobby.id,
        accountId: input.accountId,
        role: input.role,
        displayName: account.displayName,
        displayNameCanonical: canonicalDisplayName(account.displayName),
      })
      .returning({ id: lobbyMembers.id }),
  );
  // The member was created active in this transaction, so the host is an active member.
  await tx.update(lobbies).set({ hostMemberId: member.id }).where(eq(lobbies.id, lobby.id));

  return { ok: true, room: { id: lobby.id, code, hostMemberId: member.id } };
}
