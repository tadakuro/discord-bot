import { getDb } from "./store.js";
import { warns, type guildSettings } from "@dcbot/db";
import { and, eq } from "drizzle-orm";
import type { Guild, GuildMember } from "discord.js";

export async function activeWarnCount(guildId: string, userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(warns)
    .where(and(eq(warns.guildId, guildId), eq(warns.userId, userId), eq(warns.active, true)));
  return rows.length;
}

export async function punishAtLimit(
  guild: Guild,
  member: GuildMember,
  settings: typeof guildSettings.$inferSelect,
  reason: string
): Promise<string | null> {
  if (settings.warnLimit === 0) return null;
  const limit = settings.warnLimit ?? 0;
  if (limit <= 0) return null;

  const count = await activeWarnCount(guild.id, member.id);
  if (count < limit) return null;

  const action = settings.warnAction ?? "timeout";
  const detail = `Auto-punishment at ${count}/${limit} warnings: ${reason}`;
  let name = "no action";

  if (action === "timeout") {
    const mins = Math.max(1, Math.min(settings.warnTimeoutMins ?? 10, 40320));
    await member.timeout(mins * 60_000, detail).catch(() => {});
    name = `timed out (${mins} min)`;
  } else if (action === "kick") {
    await member.kick(detail).catch(() => {});
    name = "kicked";
  } else if (action === "ban") {
    await member.ban({ reason: detail }).catch(() => {});
    name = "banned";
  }

  return name;
}