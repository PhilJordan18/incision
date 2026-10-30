CREATE TABLE "lobby_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lobby_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bound_member_id" uuid,
	"bound_ip_digest" text,
	"bound_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "lobby_invitations_token_digest" CHECK ("lobby_invitations"."token_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "lobby_invitations_ip_digest" CHECK ("lobby_invitations"."bound_ip_digest" is null or "lobby_invitations"."bound_ip_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "lobby_invitations_binding_complete" CHECK (("lobby_invitations"."bound_member_id" is null and "lobby_invitations"."bound_ip_digest" is null and "lobby_invitations"."bound_at" is null) or ("lobby_invitations"."bound_member_id" is not null and "lobby_invitations"."bound_ip_digest" is not null and "lobby_invitations"."bound_at" is not null)),
	CONSTRAINT "lobby_invitations_times_ordered" CHECK (("lobby_invitations"."bound_at" is null or "lobby_invitations"."bound_at" >= "lobby_invitations"."created_at") and ("lobby_invitations"."revoked_at" is null or "lobby_invitations"."revoked_at" >= "lobby_invitations"."created_at"))
);
--> statement-breakpoint
ALTER TABLE "lobby_invitations" ADD CONSTRAINT "lobby_invitations_lobby_id_lobbies_id_fk" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobby_invitations" ADD CONSTRAINT "lobby_invitations_holder_room_fk" FOREIGN KEY ("lobby_id","bound_member_id") REFERENCES "public"."lobby_members"("lobby_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lobby_invitations_token_unique" ON "lobby_invitations" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "lobby_invitations_room_idx" ON "lobby_invitations" USING btree ("lobby_id","created_at","id");--> statement-breakpoint
CREATE INDEX "lobby_invitations_holder_idx" ON "lobby_invitations" USING btree ("bound_member_id");