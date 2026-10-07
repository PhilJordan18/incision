CREATE TYPE "public"."oauth_provider" AS ENUM('github', 'discord');--> statement-breakpoint
CREATE TYPE "public"."lobby_phase" AS ENUM('waiting', 'countdown', 'racing', 'results', 'closed');--> statement-breakpoint
CREATE TYPE "public"."lobby_visibility" AS ENUM('public', 'code', 'private');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('participant', 'spectator');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" text,
	"login_canonical" text,
	"display_name" text NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_login_canonical_unique" UNIQUE("login_canonical"),
	CONSTRAINT "accounts_login_pair" CHECK (("accounts"."login" is null) = ("accounts"."login_canonical" is null)),
	CONSTRAINT "accounts_login_format" CHECK ("accounts"."login" ~ '^[A-Za-z0-9_-]{3,32}$' and "accounts"."login_canonical" = lower("accounts"."login")),
	CONSTRAINT "accounts_password_requires_login" CHECK ("accounts"."password_hash" is null or "accounts"."login_canonical" is not null),
	CONSTRAINT "accounts_password_hash_not_empty" CHECK ("accounts"."password_hash" is null or "accounts"."password_hash" <> ''),
	CONSTRAINT "accounts_display_name_length" CHECK (char_length("accounts"."display_name") between 1 and 40 and btrim("accounts"."display_name") <> '')
);
--> statement-breakpoint
CREATE TABLE "oauth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"provider_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_identities_provider_subject_unique" UNIQUE("provider","provider_subject"),
	CONSTRAINT "oauth_identities_account_provider_unique" UNIQUE("account_id","provider"),
	CONSTRAINT "oauth_identities_subject_not_empty" CHECK (char_length("oauth_identities"."provider_subject") > 0)
);
--> statement-breakpoint
CREATE TABLE "lobbies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"visibility" "lobby_visibility" DEFAULT 'code' NOT NULL,
	"capacity" smallint NOT NULL,
	"phase" "lobby_phase" DEFAULT 'waiting' NOT NULL,
	"host_member_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "lobbies_code_unique" UNIQUE("code"),
	CONSTRAINT "lobbies_code_format" CHECK ("lobbies"."code" ~ '^[2-9A-HJKMNP-Z]{6}$'),
	CONSTRAINT "lobbies_capacity_range" CHECK ("lobbies"."capacity" between 2 and 30),
	CONSTRAINT "lobbies_revision_non_negative" CHECK ("lobbies"."revision" >= 0),
	CONSTRAINT "lobbies_closed_at_matches_phase" CHECK (("lobbies"."phase" = 'closed') = ("lobbies"."closed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "lobby_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lobby_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"display_name" text NOT NULL,
	"display_name_canonical" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "lobby_members_lobby_id_id_unique" UNIQUE("lobby_id","id"),
	CONSTRAINT "lobby_members_left_after_joined" CHECK ("lobby_members"."left_at" is null or "lobby_members"."left_at" >= "lobby_members"."joined_at"),
	CONSTRAINT "lobby_members_display_name_length" CHECK (char_length("lobby_members"."display_name") between 1 and 40 and btrim("lobby_members"."display_name") <> '')
);
--> statement-breakpoint
ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobbies" ADD CONSTRAINT "lobbies_host_member_fk" FOREIGN KEY ("id","host_member_id") REFERENCES "public"."lobby_members"("lobby_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobby_members" ADD CONSTRAINT "lobby_members_lobby_id_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobby_members" ADD CONSTRAINT "lobby_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lobby_members_active_account_unique" ON "lobby_members" USING btree ("account_id") WHERE "lobby_members"."left_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "lobby_members_active_display_name_unique" ON "lobby_members" USING btree ("lobby_id","display_name_canonical") WHERE "lobby_members"."left_at" is null;--> statement-breakpoint
CREATE INDEX "lobby_members_active_by_lobby_idx" ON "lobby_members" USING btree ("lobby_id","joined_at") WHERE "lobby_members"."left_at" is null;