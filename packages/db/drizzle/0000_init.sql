CREATE TABLE IF NOT EXISTS "guild_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"leveling_enabled" boolean DEFAULT false NOT NULL,
	"xp_cooldown_secs" integer DEFAULT 60 NOT NULL,
	"xp_min" integer DEFAULT 5 NOT NULL,
	"xp_max" integer DEFAULT 15 NOT NULL,
	"level_up_channel" text,
	"level_up_message" text DEFAULT '{user} leveled up to level {level}!',
	"stack_level_roles" boolean DEFAULT false NOT NULL,
	"welcome_enabled" boolean DEFAULT false NOT NULL,
	"welcome_channel" text,
	"welcome_message" text DEFAULT 'Welcome {user} to {server}!',
	"goodbye_enabled" boolean DEFAULT false NOT NULL,
	"goodbye_channel" text,
	"goodbye_message" text DEFAULT '{user} has left {server}.',
	"logging_enabled" boolean DEFAULT false NOT NULL,
	"log_channel" text,
	"log_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reaction_roles_message" text,
	"mod_log_channel" text,
	"mod_dm_user" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "level_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"level" integer NOT NULL,
	"role_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reaction_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"message_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"emoji" text NOT NULL,
	"role_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warns" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"moderator_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "xp_profiles" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"last_msg_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "xp_profiles_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "level_roles" ADD CONSTRAINT "level_roles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reaction_roles" ADD CONSTRAINT "reaction_roles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
