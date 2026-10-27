CREATE TABLE "race_wpm_series" (
	"race_id" uuid NOT NULL,
	"entrant_id" uuid NOT NULL,
	"series" jsonb NOT NULL,
	CONSTRAINT "race_wpm_series_pk" PRIMARY KEY("race_id","entrant_id"),
	CONSTRAINT "race_wpm_series_version" CHECK (coalesce(jsonb_typeof("race_wpm_series"."series") = 'object' and "race_wpm_series"."series"->'version' = '1'::jsonb, false)),
	CONSTRAINT "race_wpm_series_points_bound" CHECK (case when jsonb_typeof("race_wpm_series"."series"->'points') = 'array'
    then jsonb_array_length("race_wpm_series"."series"->'points') between 1 and 512 else false end),
	CONSTRAINT "race_wpm_series_size_bound" CHECK (octet_length("race_wpm_series"."series"::text) <= 262144)
);
--> statement-breakpoint
ALTER TABLE "race_wpm_series" ADD CONSTRAINT "race_wpm_series_result_fk" FOREIGN KEY ("race_id","entrant_id") REFERENCES "public"."race_results"("race_id","entrant_id") ON DELETE cascade ON UPDATE no action;