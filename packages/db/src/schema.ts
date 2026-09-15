import { pgTable, text, integer, boolean, timestamp, jsonb, primaryKey, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type AutomodConfig = {
  enabled?: boolean;
  words?: string[];
  invite?: boolean;
  caps?: boolean;
  capsPercent?: number;
  action?: "delete" | "warn";
};

export type AntiSpamConfig = {
  enabled?: boolean;
  limit?: number;
  windowSecs?: number;
  action?: "delete" | "warn" | "timeout";
  timeoutMins?: number;
  exemptRoles?: string[];
};

export type AutoModSettings = NonNullable<AutomodConfig>;

export const guilds = pgTable("guilds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  ownerId: text("owner_id"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const guildSettings = pgTable("guild_settings", {
  guildId: text("guild_id").primaryKey().references(() => guilds.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
  prefix: text("prefix").default("!").notNull(),

  // Leveling
  levelingEnabled: boolean("leveling_enabled").default(false).notNull(),
  xpCooldownSecs: integer("xp_cooldown_secs").default(60).notNull(),
  xpMin: integer("xp_min").default(5).notNull(),
  xpMax: integer("xp_max").default(15).notNull(),
  levelUpChannel: text("level_up_channel"),
  levelUpMessage: text("level_up_message").default("{user} leveled up to level {level}!"),
  stackLevelRoles: boolean("stack_level_roles").default(false).notNull(),

  // Welcome / Goodbye
  welcomeEnabled: boolean("welcome_enabled").default(false).notNull(),
  welcomeChannel: text("welcome_channel"),
  welcomeMessage: text("welcome_message").default("Welcome to **{server}**, {user}! Please check the rules and say hi — we're glad to have you here."),
  goodbyeEnabled: boolean("goodbye_enabled").default(false).notNull(),
  goodbyeChannel: text("goodbye_channel"),
  goodbyeMessage: text("goodbye_message").default("Goodbye {user}! Thanks for being part of **{server}** — hope to see you again soon."),

  // Logging
  loggingEnabled: boolean("logging_enabled").default(false).notNull(),
  logChannel: text("log_channel"),
  logEvents: jsonb("log_events").$type<string[]>().default([]).notNull(),

  // Reaction roles
  reactionRolesMessage: text("reaction_roles_message"),

  // Moderation
  modLogChannel: text("mod_log_channel"),
  modDmUser: boolean("mod_dm_user").default(true).notNull(),
  warnLimit: integer("warn_limit").default(0).notNull(),
  warnAction: text("warn_action", { enum: ["none", "timeout", "kick", "ban"] })
    .default("timeout")
    .notNull(),
  warnTimeoutMins: integer("warn_timeout_mins").default(10).notNull(),

  // Auto-mod
  automod: jsonb("automod").$type<AutomodConfig>().default({}).notNull(),

  // Anti-spam
  antispam: jsonb("antispam").$type<AntiSpamConfig>().default({}).notNull(),

  // Starboard
  starboardChannel: text("starboard_channel"),
  starboardThreshold: integer("starboard_threshold").default(3).notNull(),

  // Suggestions
  suggestionsChannel: text("suggestions_channel"),

  // Verify
  verifyRole: text("verify_role"),
  verifyChannel: text("verify_channel"),

  // Tickets
  ticketChannel: text("ticket_channel"),
  ticketCategory: text("ticket_category"),
  ticketRole: text("ticket_role"),

  // Temporary voice channels
  tempvoiceCategory: text("tempvoice_category"),
  tempvoiceLobby: text("tempvoice_lobby"),
  tempvoiceName: text("tempvoice_name").default("{username}'s channel").notNull(),

  // Birthdays
  birthdayChannel: text("birthday_channel"),

  // Anti alt (new-account restrictions)
  antialtDays: integer("antialt_days").default(0).notNull(),
});

export const levelRoles = pgTable("level_roles", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  level: integer("level").notNull(),
  roleId: text("role_id").notNull(),
});

export const xpProfiles = pgTable(
  "xp_profiles",
  {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    xp: integer("xp").default(0).notNull(),
    lastMsgAt: timestamp("last_msg_at"),
    updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);

export const reactionRoles = pgTable("reaction_roles", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  channelId: text("channel_id").notNull(),
  emoji: text("emoji").notNull(),
  roleId: text("role_id").notNull(),
});

export const autoRoles = pgTable(
  "auto_roles",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
    roleId: text("role_id").notNull(),
  },
  (t) => [unique().on(t.guildId, t.roleId)]
);

export const warns = pgTable("warns", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  moderatorId: text("moderator_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  active: boolean("active").default(true).notNull(),
});

export const afkStatus = pgTable(
  "afk_status",
  {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    reason: text("reason"),
    channelId: text("channel_id"),
    updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);

export const reminders = pgTable("reminders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id").notNull(),
  guildId: text("guild_id"),
  text: text("text").notNull(),
  remindAt: timestamp("remind_at").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    ownerId: text("owner_id").notNull(),
    aliasedTo: text("aliased_to"),
    createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  },
  (t) => [unique().on(t.guildId, t.name)]
);

export const notes = pgTable("notes", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  authorId: text("author_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const starboardMessages = pgTable("starboard_messages", {
  messageId: text("message_id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  starMessageId: text("star_message_id"),
  count: integer("count").default(0).notNull(),
});

export const giveaways = pgTable("giveaways", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id"),
  prize: text("prize").notNull(),
  winners: integer("winners").default(1).notNull(),
  endsAt: timestamp("ends_at").notNull(),
  ended: boolean("ended").default(false).notNull(),
});

export const rssFeeds = pgTable("rss_feeds", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  url: text("url").notNull(),
  lastItem: text("last_item"),
});

export const birthdays = pgTable(
  "birthdays",
  {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    month: integer("month").notNull(),
    day: integer("day").notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] })]
);