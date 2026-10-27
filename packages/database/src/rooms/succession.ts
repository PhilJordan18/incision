import { selectHostSuccessor } from "@incision/domain";
import { and, eq, isNull, sql } from "drizzle-orm";
import { lobbies, lobbyMembers } from "../schema";
import type { Transaction } from "../transaction";

/** Called with the lobby locked. Presence is sampled after the active SQL rows, never before the lock. */
export async function transferHostToConnectedMember(tx: Transaction, input: {
  readonly lobbyId: string;
  readonly outgoingHostId: string;
  readonly online: (lobbyId: string) => ReadonlySet<string>;
}): Promise<boolean> {
  const rows = await tx.select({
    memberId: lobbyMembers.id,
    joinedAtMicros: sql<string>`(extract(epoch from ${lobbyMembers.joinedAt}) * 1000000)::bigint`,
  }).from(lobbyMembers).where(and(eq(lobbyMembers.lobbyId, input.lobbyId), isNull(lobbyMembers.leftAt)));
  const members = rows.map((row) => {
    const joinedAtMicros = Number(row.joinedAtMicros);
    if (!Number.isSafeInteger(joinedAtMicros) || joinedAtMicros < 0) {
      throw new RangeError("Unsafe membership timestamp");
    }
    // The current schema contains accounts only. Guest/bot persistence belongs to its own cards.
    return { memberId: row.memberId, joinedAtMicros, kind: "account" as const, active: true };
  });
  // C1 linearizes here. A later disconnect is C2, not grounds to reverse a committed transfer.
  const online = input.online(input.lobbyId);
  const successor = selectHostSuccessor({
    outgoingHostId: input.outgoingHostId,
    members: members.map((member) => ({ ...member, connected: online.has(member.memberId) })),
  });
  if (successor === undefined) return false;
  await tx.update(lobbies).set({ hostMemberId: successor }).where(eq(lobbies.id, input.lobbyId));
  return true;
}
