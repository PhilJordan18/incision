import type { Complexity, ErrorMode, RoomPhase, TextKind, TextLanguage } from "@incision/domain";
import { and, eq, isNull } from "drizzle-orm";
import { lobbies, lobbyMembers, lobbySettings } from "../schema";
import type { Queryable } from "../transaction";

/** A room's race configuration as stored (F-03.1, CONF-01/02/08/12). */
export type RoomSettings = {
  /** Increases with every change the host saves; a new room starts at 0. */
  readonly revision: number;
  /** The language of the race texts, independent of anyone's interface (CONF-02). */
  readonly textLanguage: TextLanguage;
  /** CONF-04: requested normalized word count, frozen with each new race. */
  readonly wordCount: number;
  /** Null: no time limit (CONF-01, D-17). */
  readonly timeLimitMs: number | null;
  readonly errorMode: ErrorMode;
  /** CONF-03: a public-domain passage, or words drawn from the reviewed lists. */
  readonly textKind: TextKind;
  /** CONF-05 (D-10). */
  readonly complexity: Complexity;
  /** CONF-06: applied to the text before the race's snapshot. */
  readonly punctuation: boolean;
  readonly numbers: boolean;
  readonly capitals: boolean;
  readonly accents: boolean;
  /** CONF-07, random mode only (D-10): empty in coherent mode, enforced by the database too. */
  readonly includeCharacters: readonly string[];
  readonly excludeCharacters: readonly string[];
  /** CONF-09 (D-18): Arcade when true, training otherwise. */
  readonly bonusesEnabled: boolean;
};

/** D-19: training, bonuses off; what every room had before the host could choose (CONF-09). */
export const DEFAULT_BONUS_SETTINGS = { bonusesEnabled: false } as const satisfies Pick<RoomSettings, "bonusesEnabled">;

/** D-19's text settings: what every room had before the host could choose them. */
export const DEFAULT_TEXT_SETTINGS = {
  textKind: "coherent",
  complexity: "medium",
  punctuation: true,
  numbers: false,
  capitals: true,
  accents: true,
  includeCharacters: [],
  excludeCharacters: [],
} as const satisfies Pick<RoomSettings, "textKind" | "complexity" | "punctuation" | "numbers" | "capitals" | "accents" | "includeCharacters" | "excludeCharacters">;

/** The text language when the creator's is unknown (a tool, a room of a process older than 0006): the site's default. */
export const DEFAULT_TEXT_LANGUAGE: TextLanguage = "fr";

/** D-19 defaults for new rooms only; existing rows are never rewritten. */
export function initialRoomSettings(textLanguage: TextLanguage): RoomSettings {
  return { revision: 0, textLanguage, wordCount: 50, timeLimitMs: null, errorMode: "mandatory", ...DEFAULT_TEXT_SETTINGS, ...DEFAULT_BONUS_SETTINGS };
}

/** Preserve the former fallback for rooms created by a process older than migration 0006. */
const LEGACY_ROOM_SETTINGS: RoomSettings = { revision: 0, textLanguage: DEFAULT_TEXT_LANGUAGE, wordCount: 50, timeLimitMs: 120_000, errorMode: "mandatory", ...DEFAULT_TEXT_SETTINGS, ...DEFAULT_BONUS_SETTINGS };

/** The settings columns, read with a room through a left join. */
export const settingsColumns = {
  settingsRevision: lobbySettings.revision,
  textLanguage: lobbySettings.textLanguage,
  wordCount: lobbySettings.wordCount,
  timeLimitMs: lobbySettings.timeLimitMs,
  errorMode: lobbySettings.errorMode,
  textKind: lobbySettings.textKind,
  complexity: lobbySettings.complexity,
  punctuation: lobbySettings.punctuation,
  numbers: lobbySettings.numbers,
  capitals: lobbySettings.capitals,
  accents: lobbySettings.accents,
  includeCharacters: lobbySettings.includeCharacters,
  excludeCharacters: lobbySettings.excludeCharacters,
  bonusesEnabled: lobbySettings.bonusesEnabled,
};

type SettingsColumns = {
  readonly settingsRevision: number | null;
  readonly textLanguage: TextLanguage | null;
  readonly wordCount: number | null;
  readonly timeLimitMs: number | null;
  readonly errorMode: ErrorMode | null;
  readonly textKind: TextKind | null;
  readonly complexity: Complexity | null;
  readonly punctuation: boolean | null;
  readonly numbers: boolean | null;
  readonly capitals: boolean | null;
  readonly accents: boolean | null;
  readonly includeCharacters: readonly string[] | null;
  readonly excludeCharacters: readonly string[] | null;
  readonly bonusesEnabled: boolean | null;
};

/**
 * The settings of a left-joined row. A room created by a process older than migration 0006, while
 * a release rolls out, has no row: it keeps its legacy 120 s limit until its host saves new settings.
 */
export function settingsOf(row: SettingsColumns): RoomSettings {
  const { settingsRevision, textLanguage, wordCount, timeLimitMs, errorMode } = row;
  if (settingsRevision === null || textLanguage === null || errorMode === null) return { ...LEGACY_ROOM_SETTINGS };
  // The columns are NOT NULL with D-19 defaults; a null here means no row, handled above.
  return {
    revision: settingsRevision,
    textLanguage,
    wordCount: wordCount ?? 50,
    timeLimitMs,
    errorMode,
    textKind: row.textKind ?? DEFAULT_TEXT_SETTINGS.textKind,
    complexity: row.complexity ?? DEFAULT_TEXT_SETTINGS.complexity,
    punctuation: row.punctuation ?? DEFAULT_TEXT_SETTINGS.punctuation,
    numbers: row.numbers ?? DEFAULT_TEXT_SETTINGS.numbers,
    capitals: row.capitals ?? DEFAULT_TEXT_SETTINGS.capitals,
    accents: row.accents ?? DEFAULT_TEXT_SETTINGS.accents,
    includeCharacters: row.includeCharacters ?? DEFAULT_TEXT_SETTINGS.includeCharacters,
    excludeCharacters: row.excludeCharacters ?? DEFAULT_TEXT_SETTINGS.excludeCharacters,
    bonusesEnabled: row.bonusesEnabled ?? DEFAULT_BONUS_SETTINGS.bonusesEnabled,
  };
}

/**
 * The stored settings revision of a room, read under its lock by a save or a start. A room created
 * by a process older than migration 0006 has no row yet: its initial settings are at revision 0.
 */
export async function readSettingsRevision(tx: Queryable, lobbyId: string): Promise<number> {
  const [row] = await tx.select({ revision: lobbySettings.revision }).from(lobbySettings).where(eq(lobbySettings.lobbyId, lobbyId));
  return row?.revision ?? LEGACY_ROOM_SETTINGS.revision;
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
