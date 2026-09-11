CREATE TABLE IF NOT EXISTS "auto_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"role_id" text NOT NULL,
	CONSTRAINT "auto_roles_guild_id_role_id_unique" UNIQUE("guild_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "warn_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "warn_action" text DEFAULT 'timeout' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "warn_timeout_mins" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auto_roles" ADD CONSTRAINT "auto_roles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
