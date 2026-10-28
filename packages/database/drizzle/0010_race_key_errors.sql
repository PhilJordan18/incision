CREATE TABLE "race_key_errors" (
	"race_id" uuid NOT NULL,
	"entrant_id" uuid NOT NULL,
	"aggregate" jsonb NOT NULL,
	CONSTRAINT "race_key_errors_pk" PRIMARY KEY("race_id","entrant_id"),
	CONSTRAINT "race_key_errors_shape" CHECK (coalesce(jsonb_typeof("race_key_errors"."aggregate") = 'object'
    and "race_key_errors"."aggregate"->'version' = '1'::jsonb
    and jsonb_typeof("race_key_errors"."aggregate"->'keys') = 'array', false))
);
--> statement-breakpoint
ALTER TABLE "race_key_errors" ADD CONSTRAINT "race_key_errors_result_fk" FOREIGN KEY ("race_id","entrant_id") REFERENCES "public"."race_results"("race_id","entrant_id") ON DELETE cascade ON UPDATE no action;