CREATE TABLE "race_corpus_entries" (
	"version" text NOT NULL,
	"passage_id" text NOT NULL,
	"status" text NOT NULL,
	"complexity" text NOT NULL,
	"measures" jsonb NOT NULL,
	"editorial" jsonb NOT NULL,
	"checks" jsonb NOT NULL,
	CONSTRAINT "race_corpus_entries_pkey" PRIMARY KEY("version","passage_id"),
	CONSTRAINT "race_corpus_entries_status_known" CHECK ("race_corpus_entries"."status" in ('retained', 'spare')),
	CONSTRAINT "race_corpus_entries_complexity_known" CHECK ("race_corpus_entries"."complexity" in ('easy', 'medium', 'hard')),
	CONSTRAINT "race_corpus_entries_measures_complete" CHECK (jsonb_typeof("race_corpus_entries"."measures") = 'object' and "race_corpus_entries"."measures" ?& array['m1', 'm2', 'm3', 'm4']),
	CONSTRAINT "race_corpus_entries_editorial_object" CHECK (jsonb_typeof("race_corpus_entries"."editorial") = 'object'),
	CONSTRAINT "race_corpus_entries_checks_object" CHECK (jsonb_typeof("race_corpus_entries"."checks") = 'object')
);
--> statement-breakpoint
CREATE TABLE "race_corpus_versions" (
	"version" text PRIMARY KEY NOT NULL,
	"checksum" text NOT NULL,
	"normalization_version" smallint NOT NULL,
	"measured_with" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "race_corpus_versions_version_format" CHECK ("race_corpus_versions"."version" ~ '^[0-9a-z][0-9a-z.-]{0,62}$'),
	CONSTRAINT "race_corpus_versions_checksum_format" CHECK ("race_corpus_versions"."checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "race_corpus_versions_normalization_known" CHECK ("race_corpus_versions"."normalization_version" >= 2),
	CONSTRAINT "race_corpus_versions_measured_with_object" CHECK (jsonb_typeof("race_corpus_versions"."measured_with") = 'object')
);
--> statement-breakpoint
CREATE TABLE "race_passages" (
	"id" text PRIMARY KEY NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"normalization_version" smallint NOT NULL,
	"source_text" text NOT NULL,
	"adaptations" text[] NOT NULL,
	"source" jsonb NOT NULL,
	"word_count" integer NOT NULL,
	"content_hash" text NOT NULL,
	"first_version" text NOT NULL,
	CONSTRAINT "race_passages_language_known" CHECK ("race_passages"."language" in ('fr', 'en')),
	CONSTRAINT "race_passages_id_format" CHECK ("race_passages"."id" ~ '^(fr|en)-[0-9a-z]+(-[0-9a-z]+)*$' and char_length("race_passages"."id") <= 120),
	CONSTRAINT "race_passages_id_language" CHECK (left("race_passages"."id", 3) = "race_passages"."language" || '-'),
	CONSTRAINT "race_passages_text_length" CHECK (char_length("race_passages"."text") between 1 and 8000),
	CONSTRAINT "race_passages_source_text_not_empty" CHECK (char_length("race_passages"."source_text") > 0),
	CONSTRAINT "race_passages_normalization_known" CHECK ("race_passages"."normalization_version" >= 2),
	CONSTRAINT "race_passages_word_count_range" CHECK ("race_passages"."word_count" >= 10),
	CONSTRAINT "race_passages_source_complete" CHECK (jsonb_typeof("race_passages"."source") = 'object' and "race_passages"."source" ?& array['author', 'work', 'place', 'edition', 'url', 'revision', 'licence']),
	CONSTRAINT "race_passages_content_hash_format" CHECK ("race_passages"."content_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "race_corpus_entries" ADD CONSTRAINT "race_corpus_entries_version_race_corpus_versions_version_fk" FOREIGN KEY ("version") REFERENCES "public"."race_corpus_versions"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_corpus_entries" ADD CONSTRAINT "race_corpus_entries_passage_id_race_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."race_passages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_passages" ADD CONSTRAINT "race_passages_first_version_race_corpus_versions_version_fk" FOREIGN KEY ("first_version") REFERENCES "public"."race_corpus_versions"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "race_corpus_versions_one_active" ON "race_corpus_versions" USING btree ("active") WHERE "race_corpus_versions"."active";
--> statement-breakpoint
-- Written by hand (Drizzle does not model triggers). The corpus is append-only (F-02.3): a passage
-- id or a version never designates other content, and nothing is deleted or truncated, so a stored
-- race keeps its passage. Only a version's `active` flag changes: the WHEN clause compares every
-- other column, including any added later. A later migration that must fix data disables the
-- triggers in its own transaction (ALTER TABLE … DISABLE TRIGGER …, then ENABLE TRIGGER).
CREATE FUNCTION "race_corpus_refuse"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % refused: the race corpus is append-only', TG_OP, TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "race_corpus_versions_only_active" BEFORE UPDATE ON "race_corpus_versions" FOR EACH ROW WHEN ((to_jsonb(OLD) - 'active') IS DISTINCT FROM (to_jsonb(NEW) - 'active')) EXECUTE FUNCTION "race_corpus_refuse"();--> statement-breakpoint
CREATE TRIGGER "race_corpus_versions_no_delete" BEFORE DELETE ON "race_corpus_versions" FOR EACH ROW EXECUTE FUNCTION "race_corpus_refuse"();--> statement-breakpoint
CREATE TRIGGER "race_passages_append_only" BEFORE UPDATE OR DELETE ON "race_passages" FOR EACH ROW EXECUTE FUNCTION "race_corpus_refuse"();--> statement-breakpoint
CREATE TRIGGER "race_corpus_entries_append_only" BEFORE UPDATE OR DELETE ON "race_corpus_entries" FOR EACH ROW EXECUTE FUNCTION "race_corpus_refuse"();--> statement-breakpoint
CREATE TRIGGER "race_corpus_versions_no_truncate" BEFORE TRUNCATE ON "race_corpus_versions" FOR EACH STATEMENT EXECUTE FUNCTION "race_corpus_refuse"();--> statement-breakpoint
CREATE TRIGGER "race_passages_no_truncate" BEFORE TRUNCATE ON "race_passages" FOR EACH STATEMENT EXECUTE FUNCTION "race_corpus_refuse"();--> statement-breakpoint
CREATE TRIGGER "race_corpus_entries_no_truncate" BEFORE TRUNCATE ON "race_corpus_entries" FOR EACH STATEMENT EXECUTE FUNCTION "race_corpus_refuse"();
