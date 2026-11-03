import type { Complexity, RoomPhase, TextKind, TextLanguage } from "@incision/domain";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { lobbies, lobbyMembers, lobbySettings } from "../schema";
import type { Queryable } from "../transaction";
import { DEFAULT_BONUS_SETTINGS, DEFAULT_TEXT_LANGUAGE, DEFAULT_TEXT_SETTINGS } from "./settings";

/**
 * One open PUBLIC room as the explorer and quickplay read it (JOIN-02, JOIN-03). Only what a
 * public room already shows to anyone with its code: no account, member or invitation data.
 * `id` stays on the server (quickplay); the explorer sends the rest.
 */
export type PublicRoom = {
  readonly id: string;
  readonly code: string;
  readonly hostName: string;
  readonly phase: Exclude<RoomPhase, "closed">;
  /** Active participant members plus bots (SALLE-05); spectators are not counted. */
  readonly participants: number;
  readonly capacity: number;
  readonly textLanguage: TextLanguage;
  readonly complexity: Complexity;
  readonly textKind: TextKind;
  readonly wordCount: number;
  /** Arcade = bonuses on (D-18). */
  readonly arcade: boolean;
  readonly createdAt: Date;
};

/** Bound of one read: the explorer shows at most this many rooms, oldest first. */
export const PUBLIC_ROOM_LIST_LIMIT = 100;

/**
 * Open public rooms, oldest first then by id (stable). A plain read without locks: admission
 * checks everything again under the room lock. Rooms of a process older than 0006 have no
 * settings row and read with the defaults, like the rest of the code.
 */
export async function listPublicRooms(db: Queryable, { limit = PUBLIC_ROOM_LIST_LIMIT }: { limit?: number } = {}): Promise<PublicRoom[]> {
  const bounded = Number.isFinite(limit) ? Math.max(1, Math.min(PUBLIC_ROOM_LIST_LIMIT, Math.trunc(limit))) : PUBLIC_ROOM_LIST_LIMIT;
  const rows = await db
    .select({
      id: lobbies.id,
      code: lobbies.code,
      hostName: lobbyMembers.displayName,
      phase: lobbies.phase,
      capacity: lobbies.capacity,
      createdAt: lobbies.createdAt,
      participants: sql<number>`(
        (select count(*) from lobby_members p where p.lobby_id = ${lobbies.id} and p.role = 'participant' and p.left_at is null)
        + (select count(*) from lobby_bots b where b.lobby_id = ${lobbies.id})
      )::int`,
      textLanguage: lobbySettings.textLanguage,
      complexity: lobbySettings.complexity,
      textKind: lobbySettings.textKind,
      wordCount: lobbySettings.wordCount,
      bonusesEnabled: lobbySettings.bonusesEnabled,
    })
    .from(lobbies)
    // The host is an active member of the room; a room between two hosts is skipped for a moment.
    .innerJoin(lobbyMembers, eq(lobbyMembers.id, lobbies.hostMemberId))
    .leftJoin(lobbySettings, eq(lobbySettings.lobbyId, lobbies.id))
    .where(and(eq(lobbies.visibility, "public"), ne(lobbies.phase, "closed")))
    .orderBy(asc(lobbies.createdAt), asc(lobbies.id))
    .limit(bounded);
  return rows.flatMap((row) => row.phase === "closed" ? [] : [{
    id: row.id,
    code: row.code,
    hostName: row.hostName,
    phase: row.phase,
    participants: row.participants,
    capacity: row.capacity,
    textLanguage: row.textLanguage ?? DEFAULT_TEXT_LANGUAGE,
    complexity: row.complexity ?? DEFAULT_TEXT_SETTINGS.complexity,
    textKind: row.textKind ?? DEFAULT_TEXT_SETTINGS.textKind,
    wordCount: row.wordCount ?? 50,
    arcade: row.bonusesEnabled ?? DEFAULT_BONUS_SETTINGS.bonusesEnabled,
    createdAt: row.createdAt,
  }]);
}
