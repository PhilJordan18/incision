import { parseGuestNickname, type HumanSubject } from "@incision/domain";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import { uniqueViolationOf } from "../errors";
import { readGuestSession, type GuestSessionProof } from "../identity/guest-sessions";
import { lobbies } from "../schema";
import { boundedTransaction, type Queryable, READ_COMMITTED, type Transaction } from "../transaction";
import { admitGuestToLockedRoom, type GuestAdmissionResult } from "./guest-admission";
import { admitAccountToLockedRoom, findActiveHumanMembership, findActiveMembership, type JoinRoomResult } from "./membership";

/** Rooms tried by one quickplay request: enough to get past a few lost races for the last place. */
export const QUICKPLAY_MAX_ATTEMPTS = 10;

export type QuickplayCandidate = { readonly id: string; readonly code: string };

/**
 * Public rooms a subject could enter as a participant now (JOIN-03, D-05): open to admission
 * (waiting or results), a free place counting bots, and no ban of this subject. Fewest free
 * places first, then the oldest room, then the id. A plain read: every condition is checked
 * again under the room lock at admission.
 */
export async function quickplayCandidates(db: Queryable, subject: HumanSubject, limit = QUICKPLAY_MAX_ATTEMPTS): Promise<QuickplayCandidate[]> {
  const participants = sql<number>`(
    (select count(*) from lobby_members p where p.lobby_id = ${lobbies.id} and p.role = 'participant' and p.left_at is null)
    + (select count(*) from lobby_bots b where b.lobby_id = ${lobbies.id})
  )`;
  const banned = subject.kind === "account"
    ? sql`exists (select 1 from lobby_bans x where x.lobby_id = ${lobbies.id} and x.account_id = ${subject.accountId})`
    : sql`exists (select 1 from lobby_bans x where x.lobby_id = ${lobbies.id} and x.guest_session_id = ${subject.guestSessionId})`;
  return db
    .select({ id: lobbies.id, code: lobbies.code })
    .from(lobbies)
    .where(and(
      eq(lobbies.visibility, "public"),
      inArray(lobbies.phase, ["waiting", "results"]),
      sql`${participants} < ${lobbies.capacity}`,
      sql`not ${banned}`,
    ))
    .orderBy(sql`${lobbies.capacity} - ${participants}`, asc(lobbies.createdAt), asc(lobbies.id))
    .limit(Math.max(1, Math.min(QUICKPLAY_MAX_ATTEMPTS, Math.trunc(limit))));
}

/** Refusals that only concern one candidate: the next one is tried (D-05). */
const NEXT_CANDIDATE = new Set(["ROOM_NOT_FOUND", "ROOM_FULL", "ROOM_NOT_ADMITTING", "NICKNAME_TAKEN"]);

type QuickplayAdmission<R> = (R & { readonly ok: true; readonly code: string }) | Exclude<R, { readonly ok: true }>;

export type AccountQuickplayResult = QuickplayAdmission<JoinRoomResult> | { readonly ok: false; readonly error: "NO_ROOM" };
export type GuestQuickplayResult = QuickplayAdmission<GuestAdmissionResult> | { readonly ok: false; readonly error: "NO_ROOM" };

/**
 * Quickplay for an account (JOIN-03): tries each candidate in order, each in its own
 * transaction under the room lock, as a participant. It never creates a room: without a
 * candidate it answers NO_ROOM and the page offers a public room to create (D-19).
 */
export async function quickplayAccount(db: Database, accountId: string): Promise<AccountQuickplayResult> {
  const current = await findActiveMembership(db, accountId);
  if (current !== undefined) return { ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: current.code };
  return tryCandidates(await quickplayCandidates(db, { kind: "account", accountId }), async (candidate) => {
    try {
      return await boundedTransaction(db, async (tx) => {
        const lobby = await lockPublicRoom(tx, candidate.id);
        return lobby === undefined ? { ok: false, error: "ROOM_NOT_FOUND" } as const
          : admitAccountToLockedRoom(tx, { accountId, role: "participant", lobby });
      }, READ_COMMITTED);
    } catch (error: unknown) {
      // The same account entered another room meanwhile (another tab): the unique index won.
      if (uniqueViolationOf(error) === "lobby_members_active_account_unique") {
        const now = await findActiveMembership(db, accountId);
        if (now !== undefined) return { ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: now.code } as const;
      }
      throw error;
    }
  });
}

/** Quickplay for a guest (JOIN-03): same order and checks, with the guest's nickname and session. */
export async function quickplayGuest(db: Database, input: { readonly proof: GuestSessionProof; readonly nickname: string }): Promise<GuestQuickplayResult> {
  const nickname = parseGuestNickname(input.nickname);
  if (!nickname.ok) return nickname;
  // The proof is checked before anything is read for it; admission checks it again under lock.
  if ((await readGuestSession(db, input.proof)).kind !== "valid") return { ok: false, error: "INVALID_GUEST_SESSION" };
  const subject = { kind: "guest", guestSessionId: input.proof.id } as const;
  const current = await findActiveHumanMembership(db, subject);
  if (current !== undefined) return { ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: current.code };
  return tryCandidates(await quickplayCandidates(db, subject), (candidate) => boundedTransaction(db, async (tx) => {
    const room = await lockPublicRoom(tx, candidate.id);
    return room === undefined ? { ok: false, error: "ROOM_NOT_FOUND" } as const
      : admitGuestToLockedRoom(tx, { proof: input.proof, nickname: input.nickname, role: "participant", room });
  }, READ_COMMITTED));
}

/** Locks the room only while it is still public; READ COMMITTED rechecks it after a lock wait. */
async function lockPublicRoom(tx: Transaction, id: string) {
  const [lobby] = await tx.select({ id: lobbies.id, phase: lobbies.phase, capacity: lobbies.capacity })
    .from(lobbies).where(and(eq(lobbies.id, id), eq(lobbies.visibility, "public"))).for("update");
  return lobby;
}

async function tryCandidates<R extends { readonly ok: boolean; readonly error?: string }>(
  candidates: readonly QuickplayCandidate[],
  admit: (candidate: QuickplayCandidate) => Promise<R>,
): Promise<(R & { readonly code: string }) | Exclude<R, { readonly ok: true }> | { readonly ok: false; readonly error: "NO_ROOM" }> {
  let nicknameTaken: Exclude<R, { readonly ok: true }> | undefined;
  for (const candidate of candidates) {
    const result = await admit(candidate);
    if (result.ok) return { ...result, code: candidate.code };
    if (result.error === undefined || !NEXT_CANDIDATE.has(result.error)) return result as Exclude<R, { readonly ok: true }>;
    if (result.error === "NICKNAME_TAKEN") nicknameTaken ??= result as Exclude<R, { readonly ok: true }>;
  }
  // Every room with a place has this nickname already: say so rather than "no room".
  return nicknameTaken ?? { ok: false, error: "NO_ROOM" };
}
