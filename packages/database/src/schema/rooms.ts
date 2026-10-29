import { ERROR_MODES, MEMBER_ROLES, ROOM_PHASES, TEXT_LANGUAGES, TIME_LIMIT_MAX_MS, TIME_LIMIT_MIN_MS, MIN_TEXT_WORDS, MAX_TEXT_WORDS } from "@incision/domain";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./identity";
import { guestSessions } from "./guest-sessions";
import { races } from "./races";

export const lobbyVisibility = pgEnum("lobby_visibility", ["public", "code", "private"]);
/** COURSE-01 states: EN_ATTENTE, DECOMPTE, EN_COURSE, RESULTATS, FERMEE. */
export const lobbyPhase = pgEnum("lobby_phase", ROOM_PHASES);
export const memberRole = pgEnum("member_role", MEMBER_ROLES);
export const textLanguage = pgEnum("text_language", TEXT_LANGUAGES);
export const errorMode = pgEnum("error_mode", ERROR_MODES);

/** Presence of an account in a room. Leaving sets `left_at`; rows are kept. */
export const lobbyMembers = pgTable(
  "lobby_members",
  {
    id: uuid().primaryKey().defaultRandom(),
    lobbyId: uuid("lobby_id")
      .notNull()
      .references((): AnyPgColumn => lobbies.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "restrict" }),
    // Preparatory constraint only: guest admission is not enabled by this migration.
    guestSessionId: uuid("guest_session_id").references(() => guestSessions.id, { onDelete: "restrict" }),
    role: memberRole().notNull(),
    displayName: text("display_name").notNull(),
    displayNameCanonical: text("display_name_canonical").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    // Target of the composite host foreign key on lobbies.
    unique("lobby_members_lobby_id_id_unique").on(table.lobbyId, table.id),
    // SALLE-06: one active room per account, enforced by the database (D-04).
    uniqueIndex("lobby_members_active_account_unique").on(table.accountId).where(sql`${table.leftAt} is null`),
    uniqueIndex("lobby_members_active_guest_unique").on(table.guestSessionId).where(sql`${table.leftAt} is null`),
    check("lobby_members_one_subject", sql`(${table.accountId} is not null) <> (${table.guestSessionId} is not null)`),
    check("lobby_members_guest_name_length", sql`${table.guestSessionId} is null or char_length(${table.displayName}) between 3 and 20`),
    uniqueIndex("lobby_members_active_display_name_unique")
      .on(table.lobbyId, table.displayNameCanonical)
      .where(sql`${table.leftAt} is null`),
    index("lobby_members_active_by_lobby_idx").on(table.lobbyId, table.joinedAt).where(sql`${table.leftAt} is null`),
    check("lobby_members_left_after_joined", sql`${table.leftAt} is null or ${table.leftAt} >= ${table.joinedAt}`),
    check(
      "lobby_members_display_name_length",
      sql`char_length(${table.displayName}) between 1 and 40 and btrim(${table.displayName}) <> ''`,
    ),
  ],
);

/**
 * A room (SALLE-01/02/03/05). The host is a member of the same room through a composite
 * foreign key; that the host is still active is guaranteed by the transactions that
 * change it, not by the key.
 */
export const lobbies = pgTable(
  "lobbies",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull(),
    visibility: lobbyVisibility().notNull().default("code"),
    capacity: smallint().notNull(),
    phase: lobbyPhase().notNull().default("waiting"),
    hostMemberId: uuid("host_member_id"),
    revision: integer().notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /**
     * The race of the current or latest round. Kept after an interruption, so a returning
     * player learns that their race was interrupted; transitions compare it with the race
     * they act on (compare-and-set, ADR-0004).
     */
    currentRaceId: uuid("current_race_id"),
  },
  (table) => [
    unique("lobbies_code_unique").on(table.code),
    // Same alphabet as ROOM_CODE_ALPHABET in @incision/domain (no 0/O/1/I/L).
    check("lobbies_code_format", sql`${table.code} ~ '^[2-9A-HJKMNP-Z]{6}$'`),
    // Bound of the setting only; admission must still count participants (CP-06).
    check("lobbies_capacity_range", sql`${table.capacity} between 2 and 30`),
    check("lobbies_revision_non_negative", sql`${table.revision} >= 0`),
    check("lobbies_closed_at_matches_phase", sql`(${table.phase} = 'closed') = (${table.closedAt} is not null)`),
    // NO ACTION (checked at the end of the statement): deleting a member that hosts fails,
    // while deleting the room cascades to its members, host included.
    foreignKey({
      name: "lobbies_host_member_fk",
      columns: [table.id, table.hostMemberId],
      foreignColumns: [lobbyMembers.lobbyId, lobbyMembers.id],
    }).onDelete("no action"),
    // The current race belongs to this room. NO ACTION: deleting a race that is still current fails.
    foreignKey({
      name: "lobbies_current_race_fk",
      columns: [table.id, table.currentRaceId],
      foreignColumns: [races.lobbyId, races.id],
    }).onDelete("no action"),
    check("lobbies_active_phase_has_race", sql`${table.phase} not in ('countdown', 'racing', 'results') or ${table.currentRaceId} is not null`),
  ],
);

/**
 * A room's race configuration (F-03.1, CONF-01/02/08/12): one row per room, written with the room
 * (rooms of a process older than migration 0006 may lack it; readers then use the defaults). The
 * revision increases with every change the host saves, and a start checks it under the room lock.
 * The other text settings keep D-19's defaults until the host can choose them.
 */
export const lobbySettings = pgTable(
  "lobby_settings",
  {
    lobbyId: uuid("lobby_id")
      .primaryKey()
      .references(() => lobbies.id, { onDelete: "cascade" }),
    revision: integer().notNull().default(0),
    /** The language of the race texts, independent of anyone's interface (CONF-02). */
    textLanguage: textLanguage("text_language").notNull(),
    wordCount: smallint("word_count").notNull().default(50),
    /** Null: no time limit at all (CONF-01, D-17). */
    timeLimitMs: integer("time_limit_ms"),
    errorMode: errorMode("error_mode").notNull(),
  },
  (table) => [
    check("lobby_settings_revision_non_negative", sql`${table.revision} >= 0`),
    check("lobby_settings_word_count_range", sql`${table.wordCount} between ${sql.raw(String(MIN_TEXT_WORDS))} and ${sql.raw(String(MAX_TEXT_WORDS))}`),
    // The engine's bounds (TIME_LIMIT_MIN_MS, TIME_LIMIT_MAX_MS), whatever the server accepts today.
    check(
      "lobby_settings_time_limit_range",
      sql`${table.timeLimitMs} is null or ${table.timeLimitMs} between ${sql.raw(String(TIME_LIMIT_MIN_MS))} and ${sql.raw(String(TIME_LIMIT_MAX_MS))}`,
    ),
  ],
);
