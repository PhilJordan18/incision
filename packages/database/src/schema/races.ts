import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./identity";
import { lobbies, lobbyMembers } from "./rooms";

/** A race from its countdown to its end; `interrupted` ends without official results (D-06). */
export const RACE_STATES = ["countdown", "racing", "finished", "interrupted"] as const;
export const raceState = pgEnum("race_state", RACE_STATES);

/** The three statuses of COURSE-10. A lost connection is a reason to abandon, not a fourth status. */
export const RACE_OUTCOMES = ["finished", "timed_out", "abandoned"] as const;
export const raceOutcome = pgEnum("race_outcome", RACE_OUTCOMES);

/**
 * Why a race ended without results. Text checked against this list rather than an enum, so a
 * later reason is one additive migration (an enum value cannot be used in the transaction
 * that adds it).
 */
export const INTERRUPTION_REASONS = ["room_closed", "server_stopped", "owner_lost"] as const;
export type InterruptionReason = (typeof INTERRUPTION_REASONS)[number];

/** The engine's reasons to abandon (`AbandonReason` in @incision/domain). */
export const ABANDONMENT_REASONS = ["voluntary", "disconnection", "inactivity"] as const;
export type AbandonmentReason = (typeof ABANDONMENT_REASONS)[number];

const inList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

/**
 * One round of a room (COURSE-01). The room keeps its phase; the race keeps its frozen text and
 * configuration, its owner and its lease (ADR-0004). `lobby_id` is set to null when a room is
 * purged, so the history of its races survives (HIST-02).
 */
export const races = pgTable(
  "races",
  {
    id: uuid().primaryKey().defaultRandom(),
    lobbyId: uuid("lobby_id").references((): AnyPgColumn => lobbies.id, { onDelete: "set null" }),
    roundNo: integer("round_no").notNull(),
    state: raceState().notNull().default("countdown"),
    rulesVersion: smallint("rules_version").notNull(),
    textSnapshot: text("text_snapshot").notNull(),
    configSnapshot: jsonb("config_snapshot").notNull(),
    countdownAt: timestamp("countdown_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    interruptionReason: text("interruption_reason"),
    /** The process that runs the race in memory (ADR-0004). */
    ownerId: uuid("owner_id").notNull(),
    /** Raised when another process takes the race over: the former owner's writes then miss. */
    ownerEpoch: integer("owner_epoch").notNull().default(1),
    /** Database clock. Another process may take the race over only once it has passed. */
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("races_lobby_round_unique").on(table.lobbyId, table.roundNo),
    // Target of the composite foreign key from lobbies.current_race_id.
    unique("races_lobby_id_id_unique").on(table.lobbyId, table.id),
    index("races_active_lease_idx").on(table.leaseExpiresAt).where(sql`${table.state} in ('countdown', 'racing')`),
    check("races_round_no_positive", sql`${table.roundNo} >= 1`),
    check("races_rules_version_positive", sql`${table.rulesVersion} >= 1`),
    check("races_owner_epoch_positive", sql`${table.ownerEpoch} >= 1`),
    check("races_text_not_empty", sql`char_length(${table.textSnapshot}) > 0`),
    check("races_config_is_object", sql`jsonb_typeof(${table.configSnapshot}) = 'object'`),
    check(
      "races_started_matches_state",
      sql`(${table.state} = 'countdown' and ${table.startedAt} is null) or (${table.state} in ('racing', 'finished') and ${table.startedAt} is not null) or ${table.state} = 'interrupted'`,
    ),
    check("races_ended_matches_state", sql`(${table.state} in ('finished', 'interrupted')) = (${table.endedAt} is not null)`),
    check("races_reason_matches_state", sql`(${table.state} = 'interrupted') = (${table.interruptionReason} is not null)`),
    check("races_reason_known", sql`${table.interruptionReason} in (${inList(INTERRUPTION_REASONS)})`),
    check(
      "races_times_ordered",
      sql`${table.startedAt} >= ${table.countdownAt} and ${table.endedAt} >= coalesce(${table.startedAt}, ${table.countdownAt})`,
    ),
  ],
);

/**
 * A runner frozen at the start (COURSE-01): its id is the stable entrant id given to the
 * engine. `member_id` is set to null when the room is purged; the account keeps its history.
 */
export const raceEntrants = pgTable(
  "race_entrants",
  {
    id: uuid().primaryKey().defaultRandom(),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => lobbyMembers.id, { onDelete: "set null" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    ordinal: smallint().notNull(),
    displayNameSnapshot: text("display_name_snapshot").notNull(),
  },
  (table) => [
    unique("race_entrants_race_id_id_unique").on(table.raceId, table.id),
    unique("race_entrants_race_ordinal_unique").on(table.raceId, table.ordinal),
    unique("race_entrants_member_race_unique").on(table.memberId, table.raceId),
    // Also the account's history index.
    unique("race_entrants_account_race_unique").on(table.accountId, table.raceId),
    check("race_entrants_ordinal_range", sql`${table.ordinal} between 1 and 30`),
    check(
      "race_entrants_display_name_length",
      sql`char_length(${table.displayNameSnapshot}) between 1 and 40 and btrim(${table.displayNameSnapshot}) <> ''`,
    ),
  ],
);

/**
 * The official result of one entrant (RES-05), written once with the move to results. The
 * exact inputs of Appendix A are kept as integers; the speeds and the accuracy are stored as
 * the engine computed them, never recomputed in SQL.
 */
export const raceResults = pgTable(
  "race_results",
  {
    raceId: uuid("race_id").notNull(),
    entrantId: uuid("entrant_id").notNull(),
    outcome: raceOutcome().notNull(),
    rank: smallint().notNull(),
    // 64-bit: the engine's elapsed time and counters are exact however long a race lasts
    // (MAX_DURATION_MS, MAX_ENTRANT_INSERTS); they stay exact numbers in JavaScript (< 2^53).
    elapsedMs: bigint("elapsed_ms", { mode: "number" }).notNull(),
    position: integer().notNull(),
    length: integer().notNull(),
    correctInputs: bigint("correct_inputs", { mode: "number" }).notNull(),
    totalInputs: bigint("total_inputs", { mode: "number" }).notNull(),
    netWpm: doublePrecision("net_wpm").notNull(),
    rawWpm: doublePrecision("raw_wpm").notNull(),
    accuracy: doublePrecision().notNull(),
    abandonmentReason: text("abandonment_reason"),
  },
  (table) => [
    primaryKey({ name: "race_results_pk", columns: [table.raceId, table.entrantId] }),
    foreignKey({
      name: "race_results_entrant_fk",
      columns: [table.raceId, table.entrantId],
      foreignColumns: [raceEntrants.raceId, raceEntrants.id],
    }).onDelete("cascade"),
    // D-09 makes the ranking a total order.
    unique("race_results_race_rank_unique").on(table.raceId, table.rank),
    check("race_results_rank_positive", sql`${table.rank} >= 1`),
    check("race_results_counts_valid", sql`${table.elapsedMs} >= 0 and ${table.position} >= 0 and ${table.correctInputs} >= 0`),
    check("race_results_position_within_length", sql`${table.length} >= 1 and ${table.position} <= ${table.length}`),
    check("race_results_correct_within_total", sql`${table.correctInputs} <= ${table.totalInputs}`),
    check("race_results_finished_at_end", sql`(${table.outcome} = 'finished') = (${table.position} = ${table.length})`),
    check("race_results_speeds_valid", sql`${table.netWpm} >= 0 and ${table.rawWpm} >= ${table.netWpm}`),
    check("race_results_accuracy_range", sql`${table.accuracy} between 0 and 100`),
    check("race_results_reason_matches_outcome", sql`(${table.outcome} = 'abandoned') = (${table.abandonmentReason} is not null)`),
    check("race_results_reason_known", sql`${table.abandonmentReason} in (${inList(ABANDONMENT_REASONS)})`),
  ],
);
