CREATE TYPE "public"."race_outcome" AS ENUM('finished', 'timed_out', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."race_state" AS ENUM('countdown', 'racing', 'finished', 'interrupted');--> statement-breakpoint
CREATE TABLE "race_entrants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid NOT NULL,
	"member_id" uuid,
	"account_id" uuid NOT NULL,
	"ordinal" smallint NOT NULL,
	"display_name_snapshot" text NOT NULL,
	CONSTRAINT "race_entrants_race_id_id_unique" UNIQUE("race_id","id"),
	CONSTRAINT "race_entrants_race_ordinal_unique" UNIQUE("race_id","ordinal"),
	CONSTRAINT "race_entrants_member_race_unique" UNIQUE("member_id","race_id"),
	CONSTRAINT "race_entrants_account_race_unique" UNIQUE("account_id","race_id"),
	CONSTRAINT "race_entrants_ordinal_range" CHECK ("race_entrants"."ordinal" between 1 and 30),
	CONSTRAINT "race_entrants_display_name_length" CHECK (char_length("race_entrants"."display_name_snapshot") between 1 and 40 and btrim("race_entrants"."display_name_snapshot") <> '')
);
--> statement-breakpoint
CREATE TABLE "race_results" (
	"race_id" uuid NOT NULL,
	"entrant_id" uuid NOT NULL,
	"outcome" "race_outcome" NOT NULL,
	"rank" smallint NOT NULL,
	"elapsed_ms" bigint NOT NULL,
	"position" integer NOT NULL,
	"length" integer NOT NULL,
	"correct_inputs" bigint NOT NULL,
	"total_inputs" bigint NOT NULL,
	"net_wpm" double precision NOT NULL,
	"raw_wpm" double precision NOT NULL,
	"accuracy" double precision NOT NULL,
	"abandonment_reason" text,
	CONSTRAINT "race_results_pk" PRIMARY KEY("race_id","entrant_id"),
	CONSTRAINT "race_results_race_rank_unique" UNIQUE("race_id","rank"),
	CONSTRAINT "race_results_rank_positive" CHECK ("race_results"."rank" >= 1),
	CONSTRAINT "race_results_counts_valid" CHECK ("race_results"."elapsed_ms" >= 0 and "race_results"."position" >= 0 and "race_results"."correct_inputs" >= 0),
	CONSTRAINT "race_results_counts_exact" CHECK ("race_results"."elapsed_ms" <= 9007199254740991 and "race_results"."total_inputs" <= 9007199254740991),
	CONSTRAINT "race_results_position_within_length" CHECK ("race_results"."length" >= 1 and "race_results"."position" <= "race_results"."length"),
	CONSTRAINT "race_results_correct_within_total" CHECK ("race_results"."correct_inputs" <= "race_results"."total_inputs"),
	CONSTRAINT "race_results_finished_at_end" CHECK (("race_results"."outcome" = 'finished') = ("race_results"."position" = "race_results"."length")),
	CONSTRAINT "race_results_speeds_valid" CHECK ("race_results"."net_wpm" >= 0 and "race_results"."raw_wpm" >= "race_results"."net_wpm" and "race_results"."raw_wpm" < 'Infinity'::double precision),
	CONSTRAINT "race_results_accuracy_range" CHECK ("race_results"."accuracy" between 0 and 100),
	CONSTRAINT "race_results_reason_matches_outcome" CHECK (("race_results"."outcome" = 'abandoned') = ("race_results"."abandonment_reason" is not null)),
	CONSTRAINT "race_results_reason_known" CHECK ("race_results"."abandonment_reason" in ('voluntary', 'disconnection', 'inactivity'))
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lobby_id" uuid,
	"round_no" integer NOT NULL,
	"state" "race_state" DEFAULT 'countdown' NOT NULL,
	"rules_version" smallint NOT NULL,
	"text_snapshot" text NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"countdown_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"interruption_reason" text,
	"owner_id" uuid NOT NULL,
	"owner_epoch" integer DEFAULT 1 NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "races_lobby_round_unique" UNIQUE("lobby_id","round_no"),
	CONSTRAINT "races_lobby_id_id_unique" UNIQUE("lobby_id","id"),
	CONSTRAINT "races_round_no_positive" CHECK ("races"."round_no" >= 1),
	CONSTRAINT "races_rules_version_positive" CHECK ("races"."rules_version" >= 1),
	CONSTRAINT "races_owner_epoch_positive" CHECK ("races"."owner_epoch" >= 1),
	CONSTRAINT "races_text_not_empty" CHECK (char_length("races"."text_snapshot") > 0),
	CONSTRAINT "races_config_is_object" CHECK (jsonb_typeof("races"."config_snapshot") = 'object'),
	CONSTRAINT "races_started_matches_state" CHECK (("races"."state" = 'countdown' and "races"."started_at" is null) or ("races"."state" in ('racing', 'finished') and "races"."started_at" is not null) or "races"."state" = 'interrupted'),
	CONSTRAINT "races_ended_matches_state" CHECK (("races"."state" in ('finished', 'interrupted')) = ("races"."ended_at" is not null)),
	CONSTRAINT "races_reason_matches_state" CHECK (("races"."state" = 'interrupted') = ("races"."interruption_reason" is not null)),
	CONSTRAINT "races_reason_known" CHECK ("races"."interruption_reason" in ('room_closed', 'server_stopped', 'owner_lost', 'save_failed')),
	CONSTRAINT "races_times_ordered" CHECK ("races"."started_at" >= "races"."countdown_at" and "races"."ended_at" >= coalesce("races"."started_at", "races"."countdown_at"))
);
--> statement-breakpoint
ALTER TABLE "lobbies" ADD COLUMN "current_race_id" uuid;--> statement-breakpoint
ALTER TABLE "race_entrants" ADD CONSTRAINT "race_entrants_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_entrants" ADD CONSTRAINT "race_entrants_member_id_lobby_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."lobby_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_entrants" ADD CONSTRAINT "race_entrants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_entrant_fk" FOREIGN KEY ("race_id","entrant_id") REFERENCES "public"."race_entrants"("race_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_lobby_id_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "races_active_lease_idx" ON "races" USING btree ("lease_expires_at") WHERE "races"."state" in ('countdown', 'racing');--> statement-breakpoint
ALTER TABLE "lobbies" ADD CONSTRAINT "lobbies_current_race_fk" FOREIGN KEY ("id","current_race_id") REFERENCES "public"."races"("lobby_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobbies" ADD CONSTRAINT "lobbies_active_phase_has_race" CHECK ("lobbies"."phase" not in ('countdown', 'racing', 'results') or "lobbies"."current_race_id" is not null);