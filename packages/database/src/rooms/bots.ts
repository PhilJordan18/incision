import { type BotLevel, type RoomCode } from "@incision/domain";
import { and, count, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { lobbies, lobbyMembers } from "../schema/rooms";
import { lobbyBots } from "../schema/room-bots";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import type { RoomHostActor } from "./host-actions";
import type { GuestSessionRow } from "../identity/guest-sessions";
import { lockLiveGuest, renewGuestAfterHostAction } from "./guest-host";
import { findActiveHumanMembership, findActiveMembership } from "./membership";
import { bumpRevision } from "./room-writes";

export type RoomBot = { readonly botId: string; readonly level: BotLevel };
export type BotChange = { readonly kind: "add"; readonly level: BotLevel }
  | { readonly kind: "remove"; readonly botId: string }
  | { readonly kind: "level"; readonly botId: string; readonly level: BotLevel };
export type ChangeRoomBotsResult = { readonly ok: true; readonly lobbyId: string; readonly revision: number; readonly guestSession?: GuestSessionRow }
  | { readonly ok: false; readonly error: "NOT_IN_A_ROOM" | "NOT_HOST" | "ROOM_NOT_WAITING" | "STALE_REVISION" | "ROOM_FULL" | "BOT_NOT_FOUND" };

/** A room lock serializes bots with human admissions, departures and the start. */
export async function changeRoomBots(db: Database, input: RoomHostActor & {
  readonly code: RoomCode; readonly revision: number; readonly change: BotChange;
}): Promise<ChangeRoomBotsResult> {
  return boundedTransaction(db, async (tx): Promise<ChangeRoomBotsResult> => {
    const membership = () => input.accountId === null
      ? findActiveHumanMembership(tx, { kind: "guest", guestSessionId: input.guestProof.id })
      : findActiveMembership(tx, input.accountId);
    const seen = await membership();
    if (seen === undefined || seen.code !== input.code) return { ok: false, error: "NOT_IN_A_ROOM" };
    const [room] = await tx.select().from(lobbies).where(eq(lobbies.id, seen.lobbyId)).for("update");
    if (input.accountId === null && !await lockLiveGuest(tx, input.guestProof)) return { ok: false, error: "NOT_IN_A_ROOM" };
    const current = await membership();
    if (room === undefined || current?.memberId !== seen.memberId) return { ok: false, error: "NOT_IN_A_ROOM" };
    if (room.hostMemberId !== current.memberId) return { ok: false, error: "NOT_HOST" };
    if (room.phase !== "waiting") return { ok: false, error: "ROOM_NOT_WAITING" };
    // Also makes a retried add harmless after a lost response.
    if (room.revision !== input.revision) return { ok: false, error: "STALE_REVISION" };
    const change = input.change;
    if (change.kind === "add") {
      const [humans] = await tx.select({ value: count() }).from(lobbyMembers).where(and(
        eq(lobbyMembers.lobbyId, room.id), eq(lobbyMembers.role, "participant"), isNull(lobbyMembers.leftAt),
      ));
      const [bots] = await tx.select({ value: count() }).from(lobbyBots).where(eq(lobbyBots.lobbyId, room.id));
      if ((humans?.value ?? 0) + (bots?.value ?? 0) >= room.capacity) return { ok: false, error: "ROOM_FULL" };
      await tx.insert(lobbyBots).values({ lobbyId: room.id, level: change.level });
    } else {
      const selected = and(eq(lobbyBots.lobbyId, room.id), eq(lobbyBots.id, change.botId));
      const rows = change.kind === "remove"
        ? await tx.delete(lobbyBots).where(selected).returning({ id: lobbyBots.id })
        : await tx.update(lobbyBots).set({ level: change.level }).where(selected).returning({ id: lobbyBots.id });
      if (rows.length !== 1) return { ok: false, error: "BOT_NOT_FOUND" };
    }
    await bumpRevision(tx, room.id);
    return { ok: true, lobbyId: room.id, revision: room.revision + 1,
      ...(input.accountId === null ? { guestSession: await renewGuestAfterHostAction(tx, input.guestProof.id) } : {}),
    };
  }, READ_COMMITTED);
}
