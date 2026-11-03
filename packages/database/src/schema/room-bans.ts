import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accounts } from "./identity";
import { guestSessions } from "./guest-sessions";
import { lobbies } from "./rooms";

/** Identity-scoped exclusion; never store an address or a guest nickname. */
export const lobbyBans = pgTable("lobby_bans", {
  id: uuid().primaryKey().defaultRandom(),
  lobbyId: uuid("lobby_id").notNull().references(() => lobbies.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  guestSessionId: uuid("guest_session_id").references(() => guestSessions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("lobby_bans_one_identity", sql`num_nonnulls(${table.accountId}, ${table.guestSessionId}) = 1`),
  uniqueIndex("lobby_bans_account_unique").on(table.lobbyId, table.accountId),
  uniqueIndex("lobby_bans_guest_unique").on(table.lobbyId, table.guestSessionId),
  index("lobby_bans_guest_idx").on(table.guestSessionId),
]);
