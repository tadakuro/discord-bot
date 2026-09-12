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
  welcomeMessage: text("welcome_message").default("Welcome {user} to {server}!"),
  goodbyeEnabled: boolean("goodbye_enabled").default(false).notNull(),
  goodbyeChannel: text("goodbye_channel"),
  goodbyeMessage: text("goodbye_message").default("{user} has left {server}."),

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