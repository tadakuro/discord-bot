import { SlashCommandBuilder, type Message } from "discord.js";
import { getDb } from "../lib/store.js";
import { afkStatus } from "@dcbot/db";
import { eq, and, inArray } from "drizzle-orm";
import { C, makeEmbed, okReply, infoReply } from "../lib/embeds.js";
import { relative } from "../lib/web.js";
import type { BotCommand } from "./index.js";

export const afkCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("afk")
      .setDescription("Set yourself as away from keyboard. Auto-clears when you chat")
      .addStringOption((o) => o.setName("reason").setDescription("Why you're away")),
    async execute(interaction) {
      const db = getDb();
      const guildId = interaction.guildId!;
      const reason = interaction.options.getString("reason");
      await db
        .insert(afkStatus)
        .values({ guildId, userId: interaction.user.id, reason, channelId: interaction.channelId })
        .onConflictDoUpdate({ target: [afkStatus.guildId, afkStatus.userId], set: { reason, updatedAt: new Date(), channelId: interaction.channelId } });
      await okReply(interaction, "AFK set", `You're now AFK. We'll let people know if they mention you.\n${reason ? `**Reason:** ${reason}` : ""}`);
    },
  },
];

export async function handleAfkMessage(message: Message) {
  if (message.author.bot || !message.guildId) return;
  const db = getDb();
  const gid = message.guildId;

  const own = await db
    .select()
    .from(afkStatus)
    .where(and(eq(afkStatus.guildId, gid), eq(afkStatus.userId, message.author.id)));
  if (own.length > 0) {
    await db.delete(afkStatus).where(and(eq(afkStatus.guildId, gid), eq(afkStatus.userId, message.author.id)));
    await message.author.send({ embeds: [makeEmbed(C.success, "You're back", "Welcome back — your AFK has been cleared.")] }).catch(() => {});
  }

  if (message.mentions.users.size > 0) {
    const ids = message.mentions.users.filter((u) => !u.bot).map((u) => u.id);
    if (ids.length === 0) return;
    const rows = await db
      .select()
      .from(afkStatus)
      .where(and(eq(afkStatus.guildId, gid), inArray(afkStatus.userId, ids)));
    for (const row of rows) {
      const when = row.updatedAt ? relative(row.updatedAt) : "a while";
      const embed = makeEmbed(C.info, `${message.client.users.cache.get(row.userId)?.username ?? "Someone"} is AFK`)
        .setDescription(`${row.reason ? `\`${row.reason}\`` : "No reason set."}\nAway for ${when}.`);
      await message.reply({ embeds: [embed] }).catch(() => {});
    }
  }
}