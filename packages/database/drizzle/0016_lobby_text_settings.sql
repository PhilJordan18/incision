CREATE TYPE "public"."text_complexity" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."text_kind" AS ENUM('coherent', 'random');--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD COLUMN "text_kind" text_kind DEFAULT 'coherent' NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD COLUMN "complexity" text_complexity DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD COLUMN "punctuation" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD COLUMN "numbers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD COLUMN "capitals" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD COLUMN "accents" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD COLUMN "include_characters" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD COLUMN "exclude_characters" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD CONSTRAINT "lobby_settings_characters_random_only" CHECK ("lobby_settings"."text_kind" = 'random' or (cardinality("lobby_settings"."include_characters") = 0 and cardinality("lobby_settings"."exclude_characters") = 0));--> statement-breakpoint
ALTER TABLE "lobby_settings" ADD CONSTRAINT "lobby_settings_characters_bounded" CHECK (cardinality("lobby_settings"."include_characters") <= 100 and cardinality("lobby_settings"."exclude_characters") <= 100);