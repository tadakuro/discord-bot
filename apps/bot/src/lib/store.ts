import { createDb } from "@dcbot/db";
import { guilds, guildSettings, type DbClient } from "@dcbot/db";
import { eq } from "drizzle-orm";

let dbInstance: DbClient | null = null;

export function getDb(): DbClient {
  if (!dbInstance) dbInstance = createDb();
  return dbInstance;
}

const defaults: typeof guildSettings.$inferInsert & Record<string, unknown> = {
  guildId: "",
  levelingEnabled: false,
  welcomeEnabled: false,
  goodbyeEnabled: false,
  loggingEnabled: false,
  logEvents: [],
};

export const DEFAULT_SETTINGS = defaults;

export async function ensureGuild(guildId: string, name?: string, icon?: string | null, ownerId?: string | null) {
  const db = getDb();
  const existing = await db.query.guilds.findFirst({ where: eq(guilds.id, guildId) });
  if (!existing) {
    await db.insert(guilds).values({ id: guildId, name: name ?? "Unknown", icon: icon ?? null, ownerId: ownerId ?? null }).onConflictDoNothing();
    await db.insert(guildSettings).values({ guildId }).onConflictDoNothing();
  } else {
    await db.update(guilds).set({
      name: name ?? existing.name,
      icon: icon ?? existing.icon,
      ownerId: ownerId ?? existing.ownerId,
    }).where(eq(guilds.id, guildId));
  }
  return getSettings(guildId);
}

export async function getSettings(guildId: string) {
  const db = getDb();
  const row = await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, guildId) });
  if (!row) {
    await db.insert(guilds).values({ id: guildId, name: "Unknown" }).onConflictDoNothing();
    await db.insert(guildSettings).values({ guildId }).onConflictDoNothing();
    return db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, guildId) });
  }
  return row;
}

export async function updateSettings(guildId: string, patch: Partial<typeof guildSettings.$inferInsert>) {
  const db = getDb();
  await ensureGuild(guildId);
  await db.update(guildSettings).set(patch).where(eq(guildSettings.guildId, guildId));
  return getSettings(guildId);
}