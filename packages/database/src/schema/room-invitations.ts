import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { lobbies, lobbyMembers } from "./rooms";

/** SALLE-04: raw tokens and raw IP addresses never enter this table. */
export const lobbyInvitations = pgTable("lobby_invitations", {
  id: uuid().primaryKey().defaultRandom(),
  lobbyId: uuid("lobby_id").notNull().references(() => lobbies.id, { onDelete: "cascade" }),
  tokenDigest: text("token_digest").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  boundMemberId: uuid("bound_member_id"),
  boundIpDigest: text("bound_ip_digest"),
  boundAt: timestamp("bound_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("lobby_invitations_token_unique").on(table.tokenDigest),
  index("lobby_invitations_room_idx").on(table.lobbyId, table.createdAt, table.id),
  index("lobby_invitations_holder_idx").on(table.boundMemberId),
  foreignKey({ name: "lobby_invitations_holder_room_fk", columns: [table.lobbyId, table.boundMemberId],
    foreignColumns: [lobbyMembers.lobbyId, lobbyMembers.id] }).onDelete("cascade"),
  check("lobby_invitations_token_digest", sql`${table.tokenDigest} ~ '^[0-9a-f]{64}$'`),
  check("lobby_invitations_ip_digest", sql`${table.boundIpDigest} is null or ${table.boundIpDigest} ~ '^[0-9a-f]{64}$'`),
  check("lobby_invitations_binding_complete", sql`(${table.boundMemberId} is null and ${table.boundIpDigest} is null and ${table.boundAt} is null) or (${table.boundMemberId} is not null and ${table.boundIpDigest} is not null and ${table.boundAt} is not null)`),
  check("lobby_invitations_times_ordered", sql`(${table.boundAt} is null or ${table.boundAt} >= ${table.createdAt}) and (${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt})`),
]);
