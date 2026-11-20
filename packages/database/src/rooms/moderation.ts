import { decideExpulsion, type ExpulsionDecision, type HumanSubject, type RoomCode } from "@incision/domain";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { guestCommandFence } from "../identity/guest-command-fence";
import type { GuestSessionRow } from "../identity/guest-sessions";
import { guestSessions, lobbies, lobbyBans, lobbyInvitations, lobbyMembers } from "../schema";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import { lockLiveGuest, renewGuestAfterHostAction } from "./guest-host";
import type { RoomHostActor } from "./host-actions";
import { findActiveHumanMembership } from "./membership";
import { bumpRevision } from "./room-writes";

export type ExpelRoomMemberResult =
  | { readonly ok: true; readonly lobbyId: string; readonly memberId: string; readonly subject: HumanSubject;
      readonly revision: number; readonly guestSession?: GuestSessionRow }
  | { readonly ok: false; readonly error: Extract<ExpulsionDecision, { ok: false }>["error"] | "NOT_IN_A_ROOM" | "STALE_REVISION" };

/** Authority, ban, revoked invitations and departure commit under one admission lock. */
export async function expelRoomMember(db: Database, input: RoomHostActor & {
  readonly code: RoomCode; readonly memberId: string; readonly revision: number;
}): Promise<ExpelRoomMemberResult> {
  return guestCommandFence().mutation(() => boundedTransaction(db, async (tx): Promise<ExpelRoomMemberResult> => {
    const actor: HumanSubject = input.accountId === null
      ? { kind: "guest", guestSessionId: input.guestProof.id } : { kind: "account", accountId: input.accountId };
    const seen = await findActiveHumanMembership(tx, actor);
    if (seen?.code !== input.code) return { ok: false, error: "NOT_IN_A_ROOM" };
    const [room] = await tx.select().from(lobbies).where(eq(lobbies.id, seen.lobbyId)).for("update");
    if (input.accountId === null && !await lockLiveGuest(tx, input.guestProof)) return { ok: false, error: "NOT_IN_A_ROOM" };
    const current = await findActiveHumanMembership(tx, actor);
    if (room === undefined || current?.memberId !== seen.memberId) return { ok: false, error: "NOT_IN_A_ROOM" };
    if (room.hostMemberId !== current.memberId) return { ok: false, error: "NOT_HOST" };
    if (room.revision !== input.revision) return { ok: false, error: "STALE_REVISION" };
    const [target] = await tx.select().from(lobbyMembers).where(and(eq(lobbyMembers.id, input.memberId), eq(lobbyMembers.lobbyId, room.id)));
    const subject: HumanSubject | undefined = target?.accountId != null
      ? { kind: "account", accountId: target.accountId }
      : target?.guestSessionId != null ? { kind: "guest", guestSessionId: target.guestSessionId } : undefined;
    const decision = decideExpulsion({ phase: room.phase, actorMemberId: current.memberId, hostMemberId: room.hostMemberId,
      target: target !== undefined && subject !== undefined
        ? { memberId: target.id, subject, role: target.role, active: target.leftAt === null } : undefined });
    if (!decision.ok) return decision;
    const banned = decision.bannedSubject;
    if (banned.kind === "guest") {
      // Room -> session lock order matches admission and retention; never renew the target.
      await tx.select({ id: guestSessions.id }).from(guestSessions).where(eq(guestSessions.id, banned.guestSessionId)).for("update");
    }
    await tx.insert(lobbyBans).values({ lobbyId: room.id,
      ...(banned.kind === "account" ? { accountId: banned.accountId } : { guestSessionId: banned.guestSessionId }),
    }).onConflictDoNothing();
    await tx.update(lobbyInvitations).set({ revokedAt: sql`statement_timestamp()` })
      .where(and(eq(lobbyInvitations.lobbyId, room.id), eq(lobbyInvitations.boundMemberId, decision.memberId)));
    if (banned.kind === "guest") await tx.delete(lobbyMembers).where(eq(lobbyMembers.id, decision.memberId));
    else await tx.update(lobbyMembers).set({ leftAt: sql`statement_timestamp()` }).where(eq(lobbyMembers.id, decision.memberId));
    await bumpRevision(tx, room.id);
    return { ok: true, lobbyId: room.id, memberId: decision.memberId, subject: banned, revision: room.revision + 1,
      ...(input.accountId === null ? { guestSession: await renewGuestAfterHostAction(tx, input.guestProof.id) } : {}),
    };
  }, READ_COMMITTED));
}
