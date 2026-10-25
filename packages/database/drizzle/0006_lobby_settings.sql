CREATE TYPE "public"."error_mode" AS ENUM('free', 'mandatory');--> statement-breakpoint
CREATE TYPE "public"."text_language" AS ENUM('fr', 'en');--> statement-breakpoint
CREATE TABLE "lobby_settings" (
	"lobby_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"text_language" text_language NOT NULL,
	"time_limit_ms" integer,
	"error_mode" "error_mode" NOT NULL,
	CONSTRAINT "lobby_settings_revision_non_negative" CHECK ("lobby_settings"."revision" >= 0),
	CONSTRAINT "lobby_settings_time_limit_range" CHECK ("lobby_settings"."time_limit_ms" is null or "lobby_settings"."time_limit_ms" between 30000 and 600000)
);
--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD CONSTRAINT "lobby_settings_lobby_id_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Rooms already open keep the first race path's 120 s and mandatory correction; their texts are French, the site's default language (no host's language is stored).
INSERT INTO "lobby_settings" ("lobby_id", "text_language", "time_limit_ms", "error_mode") SELECT "id", 'fr', 120000, 'mandatory' FROM "lobbies";
