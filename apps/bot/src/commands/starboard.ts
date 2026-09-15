import { SlashCommandBuilder, type Message, type PartialMessage } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import { getDb, updateSettings, getSettings } from "../lib/store.js";
import { starboardMessages } from "@dcbot/db";
import { eq } from "drizzle-orm";
import { C, makeEmbed, okReply, errReply, infoReply } from "../lib/embeds.js";
import type { BotCommand } from "./index.js";

const STAR = "⭐";

type SnipeEntry = {
  type: "deleted" | "edited";
  content: string;
  author: string;
  avatarURL?: string;
  at: number;
  image?: string;
};

const snipes = new Map<string, SnipeEntry[]>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, entries] of snipes) {
    const fresh = entries.filter((e) => e.at > cutoff);
    if (fresh.length) snipes.set(k, fresh);
    else snipes.delete(k);
  }
}, 60_000).unref();

export function recordDeleted(message: Message | PartialMessage) {
  if (!message.guildId || message.author?.bot) return;
  if (!message.content && !message.attachments?.size) return;
  pushSnipe(message.channelId, {
    type: "deleted",
    content: message.content || "*no text*",
    author: message.author?.username ?? "unknown",
    avatarURL: message.author?.displayAvatarURL(),
    at: Date.now(),
    image: message.attachments?.first()?.url,
  });
}

export function recordEdited(before: Message | PartialMessage, after: Message | PartialMessage) {
  if (!before.guildId || before.author?.bot) return;
  if (!before.content || before.content === after.content) return;
  pushSnipe(after.channelId, {
    type: "edited",
    content: before.content,
    author: before.author?.username ?? "unknown",
    avatarURL: before.author?.displayAvatarURL(),
    at: Date.now(),
  });
}

function pushSnipe(channelId: string, entry: SnipeEntry) {
  const list = snipes.get(channelId) ?? [];
  list.unshift(entry);
  snipes.set(channelId, list.slice(0, 3));
}

function getSnipe(channelId: string, type: "deleted" | "edited"): SnipeEntry | null {
  return snipes.get(channelId)?.find((e) => e.type === type) ?? null;
}

export const starCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("starboard")
      .setDescription("Repost messages that reach a star reaction threshold")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName("set")
          .setDescription("Set the starboard channel and threshold")
          .addChannelOption((o) => o.setName("channel").setDescription("Channel to post starred messages in").setRequired(true).addChannelTypes(ChannelType.GuildText))
          .addIntegerOption((o) => o.setName("threshold").setDescription("Stars needed (default 3)").setMinValue(1).setMaxValue(50))
      )
      .addSubcommand((s) => s.setName("status").setDescription("Show the current starboard config"))
      .addSubcommand((s) => s.setName("remove").setDescription("Turn starboard off")),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "set") {
        const channel = interaction.options.getChannel("channel", true);
        const threshold = interaction.options.getInteger("threshold") ?? 3;
        await updateSettings(interaction.guildId!, { starboardChannel: channel.id, starboardThreshold: threshold });
        await okReply(interaction, "Starboard set", `Starboard goes to ${channel}, needs **${threshold}** stars.`);
        return;
      }
      if (sub === "remove") {
        await updateSettings(interaction.guildId!, { starboardChannel: null });
        await okReply(interaction, "Starboard off", "Starboard disabled.");
        return;
      }
      const s = await getSettings(interaction.guildId!);
      await infoReply(
        interaction,
        "Starboard",
        s?.starboardChannel
          ? `**Channel:** <#${s.starboardChannel}>\n**Threshold:** ⭐ ${s.starboardThreshold ?? 3}`
          : "Starboard is **off**. Configure it with `/starboard set`."
      );
    },
  },

  {
    data: new SlashCommandBuilder().setName("snipe").setDescription("Show the most recently deleted message in this channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      const entry = getSnipe(interaction.channelId, "deleted");
      if (!entry) {
        await infoReply(interaction, "Nothing to snipe", "No recent deleted messages here.");
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(C.utility)
        .setAuthor({ name: entry.author, iconURL: entry.avatarURL })
        .setDescription(entry.content)
        .setFooter({ text: `Deleted just now` });
      if (entry.image) embed.setImage(entry.image);
      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder().setName("editsnipe").setDescription("Show the most recently edited message in this channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
      const entry = getSnipe(interaction.channelId, "edited");
      if (!entry) {
        await infoReply(interaction, "Nothing to editsnipe", "No recent edits here.");
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(C.utility)
        .setAuthor({ name: entry.author, iconURL: entry.avatarURL })
        .setDescription(entry.content)
        .setFooter({ text: "Original content before edit" });
      await interaction.reply({ embeds: [embed] });
    },
  },
];

export async function handleStar(reaction: any, action: "add" | "remove", client: any) {
  try {
    if (reaction.partial) await reaction.fetch().catch(() => {});
    const message = reaction.message;
    if (message.partial) await message.fetch().catch(() => {});
    if (!message.guildId || !message.guild) return;
    const s = await getSettings(message.guildId);
    if (!s?.starboardChannel) return;
    const emojiName = reaction.emoji.name ?? reaction.emoji.id;
    if (emojiName !== STAR && emojiName !== "🌟") return;
    const target = await message.guild.channels.fetch(s.starboardChannel).catch(() => null);
    if (!target || !("send" in target)) return;

    const starReaction = message.reactions.cache.get(STAR) ?? message.reactions.cache.get("🌟") ?? null;
    const count = starReaction?.count ?? 1;
    const threshold = s.starboardThreshold ?? 3;

    const db = getDb();
    const row = await db.select().from(starboardMessages).where(eq(starboardMessages.messageId, message.id));
    if (count >= threshold) {
      const embed = new EmbedBuilder()
        .setColor(C.info)
        .setAuthor({ name: message.author?.username ?? "Unknown", iconURL: message.author?.displayAvatarURL() })
        .setDescription((message.content || "").slice(0, 1000) || "*(no text)*")
        .setFooter({ text: `⭐ ${count} · #${"name" in message.channel ? message.channel.name : "?"} · ${message.id}` });
      if (message.attachments.size) {
        const img = message.attachments.find((a: { contentType?: string }) => a.contentType?.startsWith("image/"));
        if (img) embed.setImage(img.url);
      } else if (message.embeds[0]?.image?.url) {
        embed.setImage(message.embeds[0].image.url);
      }
      if (row.length === 0) {
        await message.react(STAR).catch(() => {});
        const posted = await target.send({ embeds: [embed], content: `[Jump](<${message.url}>)` });
        await db.insert(starboardMessages).values({ messageId: message.id, guildId: message.guildId, channelId: message.channelId, starMessageId: posted.id, count });
      } else {
        const posted = row[0].starMessageId ? await (target as any).messages.fetch(row[0].starMessageId).catch(() => null) : null;
        if (posted) await posted.edit({ embeds: [embed], content: `[Jump](<${message.url}>)` }).catch(() => {});
        await db.update(starboardMessages).set({ count }).where(eq(starboardMessages.messageId, message.id));
      }
    } else if (row.length > 0 && row[0].starMessageId) {
      await (target as any).messages.fetch(row[0].starMessageId).then((m: any) => m.delete().catch(() => {})).catch(() => {});
      await db.delete(starboardMessages).where(eq(starboardMessages.messageId, message.id));
    }
  } catch (err) {
    console.error("Starboard failed:", err);
  }
}