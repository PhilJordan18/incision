ALTER TABLE "race_results" ADD COLUMN "bonus_journal" jsonb;--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_bonus_journal_shape" CHECK ("race_results"."bonus_journal" is null or
      coalesce((jsonb_typeof("race_results"."bonus_journal") = 'object'
       and "race_results"."bonus_journal"->>'version' = '1'
       and jsonb_typeof("race_results"."bonus_journal"->'grants') = 'array'
       and jsonb_array_length("race_results"."bonus_journal"->'grants') <= 3), false));