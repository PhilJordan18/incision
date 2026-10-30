import { invitationAccess, type HumanSubject, type MemberRole, type RoomCode } from "@incision/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { uniqueViolationOf } from "../errors";
import type { GuestSessionProof } from "../identity/guest-sessions";
import { lobbies, lobbyMembers } from "../schema/rooms";
import { lobbyInvitations } from "../schema/room-invitations";
import { boundedTransaction, READ_COMMITTED, type Transaction } from "../transaction";
import { admitGuestToLockedRoom, type GuestAdmissionResult } from "./guest-admission";
import { lockLiveGuest, renewGuestAfterHostAction } from "./guest-host";
import type { RoomHostActor } from "./host-actions";
import { admitAccountToLockedRoom, findActiveHumanMembership, findActiveMembership, type JoinRoomResult } from "./membership";
import { bumpRevision } from "./room-writes";

const DIGEST = /^[0-9a-f]{64}$/;
const unavailable = { ok: false, error: "INVITATION_UNAVAILABLE" } as const;

/** Existing presence keeps its IP binding even when the user skips the invitation page. */
export async function canResumeInvitationMembership(db: Database | Transaction, input: {
  readonly memberId: string; readonly addressDigest: string | undefined;
}): Promise<boolean> {
  const bindings = await db.select({ digest: lobbyInvitations.boundIpDigest }).from(lobbyInvitations)
    .where(eq(lobbyInvitations.boundMemberId, input.memberId));
  return bindings.length === 0 || (input.addressDigest !== undefined && bindings.every((binding) => binding.digest === input.addressDigest));
}

async function lockedHostRoom(tx: Transaction, input: RoomHostActor & { readonly code: RoomCode }) {
  const read = () => input.accountId === null
    ? findActiveHumanMembership(tx, { kind: "guest", guestSessionId: input.guestProof.id })
    : findActiveMembership(tx, input.accountId);
  const seen = await read();
  if (seen === undefined || seen.code !== input.code) return undefined;
  const [room] = await tx.select().from(lobbies).where(eq(lobbies.id, seen.lobbyId)).for("update");
  if (input.accountId === null && !await lockLiveGuest(tx, input.guestProof)) return undefined;
  const current = await read();
  return room !== undefined && room.phase !== "closed" && current?.memberId === seen.memberId
    && room.hostMemberId === current.memberId ? room : undefined;
}

/** Caller generated the digest from a fresh cryptographic token; never store the token. */
export async function createRoomInvitation(db: Database, input: RoomHostActor & {
  readonly code: RoomCode; readonly tokenDigest: string;
}) {
  if (!DIGEST.test(input.tokenDigest)) return unavailable;
  return boundedTransaction(db, async (tx) => {
    const room = await lockedHostRoom(tx, input);
    if (room === undefined) return unavailable;
    const [created] = await tx.insert(lobbyInvitations).values({ lobbyId: room.id, tokenDigest: input.tokenDigest,
      createdAt: sql`statement_timestamp()` }).returning({ id: lobbyInvitations.id });
    if (created === undefined) throw new Error("Invitation was not created");
    await bumpRevision(tx, room.id);
    return { ok: true as const, invitationId: created.id, lobbyId: room.id,
      ...(input.accountId === null ? { guestSession: await renewGuestAfterHostAction(tx, input.guestProof.id) } : {}) };
  }, READ_COMMITTED);
}

export async function revokeRoomInvitation(db: Database, input: RoomHostActor & {
  readonly code: RoomCode; readonly invitationId: string;
}) {
  return boundedTransaction(db, async (tx) => {
    const room = await lockedHostRoom(tx, input);
    if (room === undefined) return unavailable;
    const [invitation] = await tx.select().from(lobbyInvitations)
      .where(and(eq(lobbyInvitations.id, input.invitationId), eq(lobbyInvitations.lobbyId, room.id))).for("update");
    if (invitation === undefined) return unavailable;
    if (invitation.revokedAt !== null) return { ok: true as const, lobbyId: room.id, alreadyRevoked: true };
    await tx.update(lobbyInvitations).set({ revokedAt: sql`statement_timestamp()` }).where(eq(lobbyInvitations.id, invitation.id));
    await bumpRevision(tx, room.id);
    return { ok: true as const, lobbyId: room.id, alreadyRevoked: false,
      ...(input.accountId === null ? { guestSession: await renewGuestAfterHostAction(tx, input.guestProof.id) } : {}) };
  }, READ_COMMITTED);
}

export type InvitationActor = { readonly kind: "account"; readonly accountId: string }
  | { readonly kind: "guest"; readonly proof: GuestSessionProof; readonly nickname: string };
type InvitationJoinResult = JoinRoomResult | GuestAdmissionResult | typeof unavailable;

/** Host-only, bounded projection: neither token hashes nor address hashes leave the repository. */
export async function listRoomInvitations(db: Database, input: RoomHostActor & {
  readonly code: RoomCode; readonly page: number;
}) {
  if (!Number.isSafeInteger(input.page) || input.page < 0 || input.page > 100_000) return unavailable;
  return boundedTransaction(db, async (tx) => {
    const room = await lockedHostRoom(tx, input);
    if (room === undefined) return unavailable;
    const rows = await tx.select({ id: lobbyInvitations.id, createdAt: lobbyInvitations.createdAt,
      boundAt: lobbyInvitations.boundAt, revokedAt: lobbyInvitations.revokedAt,
      displayName: lobbyMembers.displayName }).from(lobbyInvitations)
      .leftJoin(lobbyMembers, eq(lobbyMembers.id, lobbyInvitations.boundMemberId))
      .where(eq(lobbyInvitations.lobbyId, room.id))
      .orderBy(desc(lobbyInvitations.createdAt), desc(lobbyInvitations.id)).limit(51).offset(input.page * 50);
    return { ok: true as const, items: rows.slice(0, 50), hasMore: rows.length > 50 };
  }, READ_COMMITTED);
}

/** Lock room first, then invitation, then guest: same order as host actions and departure. */
export async function joinRoomByInvitation(db: Database, input: {
  readonly tokenDigest: string;
  readonly actor: InvitationActor;
  readonly role: MemberRole;
  /** Pure server-side HMAC derivation; no network or database work inside this callback. */
  readonly addressDigestForRoom: (lobbyId: string) => string | undefined;
}): Promise<InvitationJoinResult> {
  if (!DIGEST.test(input.tokenDigest)) return unavailable;
  const subject: HumanSubject = input.actor.kind === "account" ? input.actor
    : { kind: "guest", guestSessionId: input.actor.proof.id };
  try {
    return await boundedTransaction(db, async (tx): Promise<InvitationJoinResult> => {
      const [located] = await tx.select({ lobbyId: lobbyInvitations.lobbyId }).from(lobbyInvitations)
        .where(eq(lobbyInvitations.tokenDigest, input.tokenDigest));
      if (located === undefined) return unavailable;
      const [room] = await tx.select().from(lobbies).where(eq(lobbies.id, located.lobbyId)).for("update");
      const [invitation] = await tx.select().from(lobbyInvitations)
        .where(eq(lobbyInvitations.tokenDigest, input.tokenDigest)).for("update");
      if (room === undefined || invitation === undefined) return unavailable;
      const addressDigest = input.addressDigestForRoom(room.id);
      if (addressDigest === undefined || !DIGEST.test(addressDigest)) return unavailable;
      let binding = null;
      if (invitation.boundMemberId !== null) {
        const [holder] = await tx.select().from(lobbyMembers).where(eq(lobbyMembers.id, invitation.boundMemberId));
        if (holder === undefined || invitation.boundIpDigest === null) return unavailable;
        const boundSubject: HumanSubject | undefined = holder.accountId !== null
          ? { kind: "account", accountId: holder.accountId }
          : holder.guestSessionId !== null ? { kind: "guest", guestSessionId: holder.guestSessionId } : undefined;
        if (boundSubject === undefined) return unavailable;
        binding = { subject: boundSubject, addressDigest: invitation.boundIpDigest };
      }
      const access = invitationAccess({ roomClosed: room.phase === "closed", revoked: invitation.revokedAt !== null,
        binding, subject, addressDigest });
      if (!access.ok) return access;
      const admitted = input.actor.kind === "account"
        ? await admitAccountToLockedRoom(tx, { accountId: input.actor.accountId, role: input.role, lobby: room })
        : await admitGuestToLockedRoom(tx, { proof: input.actor.proof, nickname: input.actor.nickname, role: input.role, room });
      if (!admitted.ok) return admitted;
      if (!await canResumeInvitationMembership(tx, { memberId: admitted.memberId, addressDigest })) return unavailable;
      if (access.kind === "bind") {
        await tx.update(lobbyInvitations).set({ boundMemberId: admitted.memberId, boundIpDigest: addressDigest,
          boundAt: sql`statement_timestamp()` }).where(eq(lobbyInvitations.id, invitation.id));
        // Admission already changed the room revision, except for a pre-existing member.
        if (admitted.alreadyMember) await bumpRevision(tx, room.id);
      } else if (invitation.boundMemberId !== admitted.memberId) {
        // Re-admission after departure moves the binding to the new presence of the same identity.
        await tx.update(lobbyInvitations).set({ boundMemberId: admitted.memberId }).where(eq(lobbyInvitations.id, invitation.id));
      }
      return admitted;
    }, READ_COMMITTED);
  } catch (error: unknown) {
    const constraint = uniqueViolationOf(error);
    if (constraint === "lobby_members_active_account_unique" || constraint === "lobby_members_active_guest_unique") {
      const current = await findActiveHumanMembership(db, subject);
      if (current !== undefined) return { ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: current.code };
    }
    throw error;
  }
}
