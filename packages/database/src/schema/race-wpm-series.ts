import { MAX_WPM_SERIES_POINTS } from "@incision/domain";
import { sql } from "drizzle-orm";
import { check, foreignKey, jsonb, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { raceResults } from "./races";

/** One bounded versioned JSON value, not one SQL row per sample. Legacy results have no row. */
export const raceWpmSeries = pgTable("race_wpm_series", {
  raceId: uuid("race_id").notNull(),
  entrantId: uuid("entrant_id").notNull(),
  // Unknown on read: validate both the shape and consistency with the saved result.
  series: jsonb().$type<unknown>().notNull(),
}, (table) => [
  primaryKey({ name: "race_wpm_series_pk", columns: [table.raceId, table.entrantId] }),
  foreignKey({ name: "race_wpm_series_result_fk", columns: [table.raceId, table.entrantId],
    foreignColumns: [raceResults.raceId, raceResults.entrantId] }).onDelete("cascade"),
  check("race_wpm_series_version", sql`coalesce(jsonb_typeof(${table.series}) = 'object' and ${table.series}->'version' = '1'::jsonb, false)`),
  check("race_wpm_series_points_bound", sql`case when jsonb_typeof(${table.series}->'points') = 'array'
    then jsonb_array_length(${table.series}->'points') between 1 and ${sql.raw(String(MAX_WPM_SERIES_POINTS))} else false end`),
  // Every valid 512-point series fits comfortably; bounds manual/imported data before reads.
  check("race_wpm_series_size_bound", sql`octet_length(${table.series}::text) <= ${sql.raw(String(MAX_WPM_SERIES_POINTS * 512))}`),
]);
