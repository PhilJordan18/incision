import { sql } from "drizzle-orm";
import { check, customType, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { accounts } from "./identity";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** Only server-reencoded 256px WebP; no original, filename, metadata or external URL (D-23). */
export const profilePhotos = pgTable("profile_photos", {
  accountId: uuid("account_id").primaryKey().references(() => accounts.id, { onDelete: "cascade" }),
  webp: bytea().notNull(),
  revision: uuid().notNull().defaultRandom(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("profile_photos_bytes", sql`octet_length(${table.webp}) between 12 and 262144`),
  check("profile_photos_webp", sql`substring(${table.webp} from 1 for 4) = decode('52494646', 'hex') and substring(${table.webp} from 9 for 4) = decode('57454250', 'hex')`),
]);
