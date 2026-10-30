import type { HumanSubject } from "@incision/domain";
import { and, eq } from "drizzle-orm";
import { lobbyBans } from "../schema/room-bans";
import type { Transaction } from "../transaction";

/** Called under the same room lock as expulsion and admission. */
export async function isBannedFromRoom(tx: Transaction, lobbyId: string, subject: HumanSubject): Promise<boolean> {
  const [ban] = await tx.select({ id: lobbyBans.id }).from(lobbyBans).where(and(
    eq(lobbyBans.lobbyId, lobbyId), subject.kind === "account"
      ? eq(lobbyBans.accountId, subject.accountId)
      : eq(lobbyBans.guestSessionId, subject.guestSessionId),
  )).limit(1);
  return ban !== undefined;
}
