CREATE TABLE "profile_photos" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"webp" "bytea" NOT NULL,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_photos_bytes" CHECK (octet_length("profile_photos"."webp") between 12 and 262144),
	CONSTRAINT "profile_photos_webp" CHECK (substring("profile_photos"."webp" from 1 for 4) = decode('52494646', 'hex') and substring("profile_photos"."webp" from 9 for 4) = decode('57454250', 'hex'))
);
--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;