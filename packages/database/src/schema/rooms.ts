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

export const lobbyVisibility = pgEnum("lobby_visibility", ["public", "code", "private"]);
/** COURSE-01 states: EN_ATTENTE, DECOMPTE, EN_COURSE, RESULTATS, FERMEE. */
export const lobbyPhase = pgEnum("lobby_phase", ["waiting", "countdown", "racing", "results", "closed"]);
export const memberRole = pgEnum("member_role", ["participant", "spectator"]);

/** Presence of an account in a room. Leaving sets `left_at`; rows are kept. */
export const lobbyMembers = pgTable(
  "lobby_members",
  {
    id: uuid().primaryKey().defaultRandom(),
    lobbyId: uuid("lobby_id")
      .notNull()
      .references((): AnyPgColumn => lobbies.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
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
    uniqueIndex("lobby_members_active_display_name_unique")
      .on(table.lobbyId, table.displayNameCanonical)
      .where(sql`${table.leftAt} is null`),
    index("lobby_members_active_by_lobby_idx").on(table.lobbyId, table.joinedAt).where(sql`${table.leftAt} is null`),
    check("lobby_members_left_after_joined", sql`${table.leftAt} is null or ${table.leftAt} >= ${table.joinedAt}`),
    check("lobby_members_display_name_length", sql`char_length(${table.displayName}) between 1 and 40`),
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
  ],
);
