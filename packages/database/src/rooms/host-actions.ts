import { guestCommandFence } from "../identity/guest-command-fence";
import type { RoomCode, RoomPhase } from "@incision/domain";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { lobbies, lobbySettings } from "../schema";
import { boundedTransaction, READ_COMMITTED, type Transaction } from "../transaction";
import type { GuestSessionProof, GuestSessionRow } from "../identity/guest-sessions";
import { lockLiveGuest, renewGuestAfterHostAction } from "./guest-host";
import { findActiveHumanMembership, findActiveMembership } from "./membership";
import { bumpRevision, closeLockedRoom } from "./room-writes";
import { readSettingsRevision, type RoomSettings } from "./settings";

/**
 * What only the host of a room does: change its settings while it waits (F-03.1), and once a race
 * is over (COURSE-11, F-04.7), take everyone present back to the waiting room for the next round,
 * or close the room. Each runs under the room lock, with the host read again after it: a second
 * tab, a departure or another host action may have committed meanwhile.
 */

export type RoomHostActor = { readonly accountId: string; readonly guestProof?: never } |
  { readonly accountId: null; readonly guestProof: GuestSessionProof };

export type HostRefusal = "NOT_IN_A_ROOM" | "NOT_HOST";

export type NextRoundResult =
  | { readonly ok: true; readonly lobbyId: string; readonly alreadyDone: boolean; readonly guestSession?: GuestSessionRow }
  /** NOT_ON_RESULTS: the room does not show this race's results (another race, or none). */
  | { readonly ok: false; readonly error: HostRefusal | "NOT_ON_RESULTS" };

export type CloseRoomResult =
  | { readonly ok: true; readonly lobbyId: string }
  /** ROOM_RACING: a race counts down or runs; closing then is the host leaving (D-06), not this. */
  | { readonly ok: false; readonly error: HostRefusal | "ROOM_RACING" };

export type ConfigureRoomResult =
  | { readonly ok: true; readonly lobbyId: string; readonly revision: number; readonly guestSession?: GuestSessionRow }
  /**
   * ROOM_NOT_WAITING: settings are locked from the countdown to the results (state-machines §1).
   * STALE_REVISION: the page did not show the settings saved last (another tab of the host).
   */
  | { readonly ok: false; readonly error: HostRefusal | "ROOM_NOT_WAITING" | "STALE_REVISION" };

type LockedRoom = { readonly lobbyId: string; readonly phase: RoomPhase; readonly currentRaceId: string | null };

/**
 * The room of the account, locked, if the account is its host; otherwise why not. With `code`,
 * only that room: a page left open on a room the account has since left never acts on its next one.
 */
async function lockOwnRoom(tx: Transaction, actor: RoomHostActor, code?: RoomCode): Promise<LockedRoom | HostRefusal> {
  const membership = () => actor.accountId === null
    ? findActiveHumanMembership(tx, { kind: "guest", guestSessionId: actor.guestProof.id })
    : findActiveMembership(tx, actor.accountId);
  const seen = await membership();
  if (seen === undefined || (code !== undefined && seen.code !== code)) {
    return "NOT_IN_A_ROOM";
  }
  const [lobby] = await tx
    .select({ hostMemberId: lobbies.hostMemberId, phase: lobbies.phase, currentRaceId: lobbies.currentRaceId })
    .from(lobbies)
    .where(eq(lobbies.id, seen.lobbyId))
    .for("update");
  if (actor.accountId === null && !await lockLiveGuest(tx, actor.guestProof)) return "NOT_IN_A_ROOM";
  const current = await membership();
  if (lobby === undefined || current?.lobbyId !== seen.lobbyId) {
    return "NOT_IN_A_ROOM";
  }
  if (lobby.hostMemberId !== current.memberId) {
    return "NOT_HOST";
  }
  return { lobbyId: seen.lobbyId, phase: lobby.phase, currentRaceId: lobby.currentRaceId };
}

/**
 * RESULTS → WAITING for the round after `raceId` (COURSE-01): everyone present stays, including
 * whoever joined on the results (SALLE-09), and the host starts the next race from there. The
 * race id makes a late or repeated request harmless: once the room waits after that race, it is
 * already done; once another race started, it is refused.
 */
export async function startNextRound(db: Database, input: RoomHostActor & { readonly raceId: string }): Promise<NextRoundResult> {
  return boundedTransaction(
    db,
    async (tx): Promise<NextRoundResult> => {
      const room = await lockOwnRoom(tx, input);
      if (typeof room === "string") {
        return { ok: false, error: room };
      }
      if (room.currentRaceId !== input.raceId) {
        return { ok: false, error: "NOT_ON_RESULTS" };
      }
      if (room.phase === "waiting") {
        return { ok: true, lobbyId: room.lobbyId, alreadyDone: true };
      }
      if (room.phase !== "results") {
        return { ok: false, error: "NOT_ON_RESULTS" };
      }
      // The finished race stays the room's current race until the next one starts.
      await tx
        .update(lobbies)
        .set({ phase: "waiting", revision: sql`${lobbies.revision} + 1` })
        .where(eq(lobbies.id, room.lobbyId));
      return { ok: true, lobbyId: room.lobbyId, alreadyDone: false,
        ...(input.accountId === null ? { guestSession: await renewGuestAfterHostAction(tx, input.guestProof.id) } : {}),
      };
    },
    READ_COMMITTED,
  );
}

/**
 * The host closes the room `code`, the one its page shows, from the waiting room or the results
 * (state-machines §1): every member leaves with it. Its races stay readable by their entrants
 * (HIST-02).
 */
export async function closeRoom(db: Database, input: RoomHostActor & { readonly code: RoomCode }): Promise<CloseRoomResult> {
  return guestCommandFence().mutation(() => boundedTransaction(
    db,
    async (tx): Promise<CloseRoomResult> => {
      const room = await lockOwnRoom(tx, input, input.code);
      if (typeof room === "string") {
        return { ok: false, error: room };
      }
      if (room.phase === "countdown" || room.phase === "racing") {
        return { ok: false, error: "ROOM_RACING" };
      }
      await closeLockedRoom(tx, room.lobbyId);
      await bumpRevision(tx, room.lobbyId);
      return { ok: true, lobbyId: room.lobbyId };
    },
    READ_COMMITTED,
  ));
}

/**
 * The host saves the settings of the room `code` (F-03.1, CONF-12), while it waits: the revision
 * the page showed must still be the stored one, then both revisions increase, so every member's
 * page gets the new settings with the next snapshot. Values come checked by the caller; the
 * table's constraints hold the engine's bounds.
 */
export async function configureRoom(
  db: Database,
  input: RoomHostActor & {
    readonly code: RoomCode;
    readonly revision: number;
    readonly settings: Omit<RoomSettings, "revision">;
  },
): Promise<ConfigureRoomResult> {
  return boundedTransaction(
    db,
    async (tx): Promise<ConfigureRoomResult> => {
      const room = await lockOwnRoom(tx, input, input.code);
      if (typeof room === "string") {
        return { ok: false, error: room };
      }
      if (room.phase !== "waiting") {
        return { ok: false, error: "ROOM_NOT_WAITING" };
      }
      const current = await readSettingsRevision(tx, room.lobbyId);
      if (input.revision !== current) {
        return { ok: false, error: "STALE_REVISION" };
      }
      const { includeCharacters, excludeCharacters } = input.settings;
      const saved = { ...input.settings, includeCharacters: [...includeCharacters], excludeCharacters: [...excludeCharacters], revision: current + 1 };
      await tx
        .insert(lobbySettings)
        .values({ ...saved, lobbyId: room.lobbyId })
        .onConflictDoUpdate({ target: lobbySettings.lobbyId, set: saved });
      await bumpRevision(tx, room.lobbyId);
      return { ok: true, lobbyId: room.lobbyId, revision: saved.revision,
        ...(input.accountId === null ? { guestSession: await renewGuestAfterHostAction(tx, input.guestProof.id) } : {}),
      };
    },
    READ_COMMITTED,
  );
}
