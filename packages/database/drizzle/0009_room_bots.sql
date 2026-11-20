CREATE TABLE "lobby_bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lobby_id" uuid NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lobby_bots_level_known" CHECK ("lobby_bots"."level" in ('noob', 'beginner', 'intermediate', 'expert', 'impossible'))
);
--> statement-breakpoint
ALTER TABLE "lobby_bots" ADD CONSTRAINT "lobby_bots_lobby_id_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lobby_bots_lobby_idx" ON "lobby_bots" USING btree ("lobby_id","created_at","id");