import { BOT_LEVELS, type BotLevel } from "@incision/domain";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { lobbies } from "./rooms";

/** Bots have no account or membership: neither authentication nor hosting is possible. */
export const lobbyBots = pgTable("lobby_bots", {
  id: uuid().primaryKey().defaultRandom(),
  lobbyId: uuid("lobby_id").notNull().references(() => lobbies.id, { onDelete: "cascade" }),
  level: text().$type<BotLevel>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("lobby_bots_lobby_idx").on(table.lobbyId, table.createdAt, table.id),
  check("lobby_bots_level_known", sql`${table.level} in (${sql.raw(BOT_LEVELS.map((level) => `'${level}'`).join(", "))})`),
]);
