CREATE TABLE "lobby_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lobby_id" uuid NOT NULL,
	"account_id" uuid,
	"guest_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lobby_bans_one_identity" CHECK (num_nonnulls("lobby_bans"."account_id", "lobby_bans"."guest_session_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "lobby_bans" ADD CONSTRAINT "lobby_bans_lobby_id_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobby_bans" ADD CONSTRAINT "lobby_bans_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobby_bans" ADD CONSTRAINT "lobby_bans_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lobby_bans_account_unique" ON "lobby_bans" USING btree ("lobby_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lobby_bans_guest_unique" ON "lobby_bans" USING btree ("lobby_id","guest_session_id");--> statement-breakpoint
CREATE INDEX "lobby_bans_guest_idx" ON "lobby_bans" USING btree ("guest_session_id");