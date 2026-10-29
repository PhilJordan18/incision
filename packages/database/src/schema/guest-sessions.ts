import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Ephemeral bearer identity, separate from accounts. No nickname or raw cookie proof. */
export const guestSessions = pgTable("guest_sessions", {
  id: uuid().primaryKey(),
  secretDigest: text("secret_digest").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("guest_sessions_expiry_idx").on(table.expiresAt),
  check("guest_sessions_digest_format", sql`${table.secretDigest} ~ '^[0-9a-f]{64}$'`),
  check("guest_sessions_times_ordered", sql`${table.lastSeenAt} >= ${table.createdAt} and ${table.expiresAt} = ${table.lastSeenAt} + interval '24 hours'`),
]);
