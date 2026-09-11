import { getDb } from "./store.js";
import { guildSettings } from "@dcbot/db";
import { eq } from "drizzle-orm";
import { EmbedBuilder, type Client } from "discord.js";

export async function sendLog(client: Client, guildId: string, event: string, embed: EmbedBuilder) {
  const db = getDb();
  const settings = await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, guildId) });
  if (!settings?.loggingEnabled) return;
  if (!settings.logChannel) return;
  if (!(settings.logEvents ?? []).includes(event)) return;

  const channel = await client.channels.fetch(settings.logChannel).catch(() => null);
  if (!channel || !("send" in channel)) return;
  embed.setColor(0x2b2d31).setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}