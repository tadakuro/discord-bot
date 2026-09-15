CREATE TABLE IF NOT EXISTS "afk_status" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reason" text,
	"channel_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "afk_status_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "birthdays" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"month" integer NOT NULL,
	"day" integer NOT NULL,
	CONSTRAINT "birthdays_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "giveaways" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"prize" text NOT NULL,
	"winners" integer DEFAULT 1 NOT NULL,
	"ends_at" timestamp NOT NULL,
	"ended" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"guild_id" text,
	"text" text NOT NULL,
	"remind_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rss_feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"url" text NOT NULL,
	"last_item" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "starboard_messages" (
	"message_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"star_message_id" text,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"owner_id" text NOT NULL,
	"aliased_to" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_guild_id_name_unique" UNIQUE("guild_id","name")
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "starboard_channel" text;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "starboard_threshold" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "suggestions_channel" text;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "verify_role" text;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "verify_channel" text;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "ticket_channel" text;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "ticket_category" text;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "ticket_role" text;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "tempvoice_category" text;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "tempvoice_name" text DEFAULT '{username}''s channel' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "antialt_days" integer DEFAULT 0 NOT NULL;