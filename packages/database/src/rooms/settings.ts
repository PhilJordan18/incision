import type { ErrorMode, RoomPhase, TextLanguage } from "@incision/domain";
import { and, eq, isNull } from "drizzle-orm";
import { lobbies, lobbyMembers, lobbySettings } from "../schema";
import type { Queryable } from "../transaction";

/** A room's race configuration as stored (F-03.1, CONF-01/02/08/12). */
export type RoomSettings = {
  /** Increases with every change the host saves; a new room starts at 0. */
  readonly revision: number;
  /** The language of the race texts, independent of anyone's interface (CONF-02). */
  readonly textLanguage: TextLanguage;
  /** Null: no time limit (CONF-01, D-17). */
  readonly timeLimitMs: number | null;
  readonly errorMode: ErrorMode;
};

/** The text language when the creator's is unknown (a tool, a room of a process older than 0006): the site's default. */
export const DEFAULT_TEXT_LANGUAGE: TextLanguage = "fr";

/**
 * A new room's settings: D-19's mandatory correction, texts in the creator's interface language,
 * and the first race path's 120 s. D-19's "no limit" waits for the lease-suspension fix of D-17
 * (COURSE-09).
 */
export function initialRoomSettings(textLanguage: TextLanguage): RoomSettings {
  return { revision: 0, textLanguage, timeLimitMs: 120_000, errorMode: "mandatory" };
}

/** The settings columns, read with a room through a left join. */
export const settingsColumns = {
  settingsRevision: lobbySettings.revision,
  textLanguage: lobbySettings.textLanguage,
  timeLimitMs: lobbySettings.timeLimitMs,
  errorMode: lobbySettings.errorMode,
};

type SettingsColumns = {
  readonly settingsRevision: number | null;
  readonly textLanguage: TextLanguage | null;
  readonly timeLimitMs: number | null;
  readonly errorMode: ErrorMode | null;
};

/**
 * The settings of a left-joined row. A room created by a process older than migration 0006, while
 * a release rolls out, has no row: it races with the initial settings until its host saves some.
 */
export function settingsOf(row: SettingsColumns): RoomSettings {
  const { settingsRevision, textLanguage, timeLimitMs, errorMode } = row;
  return settingsRevision === null || textLanguage === null || errorMode === null
    ? initialRoomSettings(DEFAULT_TEXT_LANGUAGE)
    : { revision: settingsRevision, textLanguage, timeLimitMs, errorMode };
}

/** The room an account occupies and its settings, as read before a start: checked again under the room lock. */
export type OwnRoomSettings = {
  readonly lobbyId: string;
  readonly phase: RoomPhase;
  readonly isHost: boolean;
  readonly settings: RoomSettings;
};

/**
 * The settings of the account's room, in one statement, without a lock: what a start draws its
 * text with. The start transaction checks the revision again under the room lock.
 */
export async function readOwnRoomSettings(db: Queryable, accountId: string): Promise<OwnRoomSettings | undefined> {
  const [row] = await db
    .select({ lobbyId: lobbies.id, phase: lobbies.phase, hostMemberId: lobbies.hostMemberId, memberId: lobbyMembers.id, ...settingsColumns })
    .from(lobbyMembers)
    .innerJoin(lobbies, eq(lobbies.id, lobbyMembers.lobbyId))
    .leftJoin(lobbySettings, eq(lobbySettings.lobbyId, lobbies.id))
    .where(and(eq(lobbyMembers.accountId, accountId), isNull(lobbyMembers.leftAt)));
  return row === undefined
    ? undefined
    : { lobbyId: row.lobbyId, phase: row.phase, isHost: row.hostMemberId === row.memberId, settings: settingsOf(row) };
}
