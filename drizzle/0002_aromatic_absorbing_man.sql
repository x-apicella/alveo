CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invites_code_unique" UNIQUE("code"),
	CONSTRAINT "invites_usage_valid" CHECK ("invites"."uses" >= 0 AND ("invites"."max_uses" IS NULL OR ("invites"."max_uses" > 0 AND "invites"."uses" <= "invites"."max_uses")))
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_server_idx" ON "invites" USING btree ("server_id");--> statement-breakpoint
-- Give existing links a seven-day transition window, then retire them.
INSERT INTO "invites" ("server_id", "code", "expires_at")
SELECT "id", "invite_code", clock_timestamp() + interval '7 days' FROM "servers";
