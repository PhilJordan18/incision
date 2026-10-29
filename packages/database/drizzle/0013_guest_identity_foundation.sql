CREATE TABLE "guest_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"secret_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guest_sessions_secret_digest_unique" UNIQUE("secret_digest"),
	CONSTRAINT "guest_sessions_digest_format" CHECK ("guest_sessions"."secret_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "guest_sessions_times_ordered" CHECK ("guest_sessions"."last_seen_at" >= "guest_sessions"."created_at" and "guest_sessions"."expires_at" = "guest_sessions"."last_seen_at" + interval '24 hours')
);
--> statement-breakpoint
ALTER TABLE "lobby_members" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lobby_members" ADD COLUMN "guest_session_id" uuid;--> statement-breakpoint
CREATE INDEX "guest_sessions_expiry_idx" ON "guest_sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "lobby_members" ADD CONSTRAINT "lobby_members_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lobby_members_active_guest_unique" ON "lobby_members" USING btree ("guest_session_id") WHERE "lobby_members"."left_at" is null;--> statement-breakpoint
ALTER TABLE "lobby_members" ADD CONSTRAINT "lobby_members_one_subject" CHECK (("lobby_members"."account_id" is not null) <> ("lobby_members"."guest_session_id" is not null));--> statement-breakpoint
ALTER TABLE "lobby_members" ADD CONSTRAINT "lobby_members_guest_name_length" CHECK ("lobby_members"."guest_session_id" is null or char_length("lobby_members"."display_name") between 3 and 20);