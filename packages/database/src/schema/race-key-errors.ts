import { sql } from "drizzle-orm";
import { check, foreignKey, jsonb, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { raceResults } from "./races";

/** Missing rows mean not collected, including legacy races; an empty array means zero errors. */
export const raceKeyErrors = pgTable("race_key_errors", {
  raceId: uuid("race_id").notNull(),
  entrantId: uuid("entrant_id").notNull(),
  aggregate: jsonb().$type<unknown>().notNull(),
}, (table) => [
  primaryKey({ name: "race_key_errors_pk", columns: [table.raceId, table.entrantId] }),
  foreignKey({ name: "race_key_errors_result_fk", columns: [table.raceId, table.entrantId],
    foreignColumns: [raceResults.raceId, raceResults.entrantId] }).onDelete("cascade"),
  check("race_key_errors_shape", sql`coalesce(jsonb_typeof(${table.aggregate}) = 'object'
    and ${table.aggregate}->'version' = '1'::jsonb
    and jsonb_typeof(${table.aggregate}->'keys') = 'array', false)`),
]);
