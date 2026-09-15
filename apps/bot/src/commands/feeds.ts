import { SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder, ChannelType, PermissionFlagsBits, type ChatInputCommandInteraction, type TextChannel } from "discord.js";
import { getDb, updateSettings, getSettings } from "../lib/store.js";
import { rssFeeds, birthdays } from "@dcbot/db";
import { eq, and } from "drizzle-orm";
import { uid } from "../lib/uid.js";
import { okReply, errReply, infoReply } from "../lib/embeds.js";
import { feedLabel } from "../lib/rss.js";
import type { BotCommand } from "./index.js";

type AnyBuilder = SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
const mod = (b: AnyBuilder) => (b as SlashCommandBuilder).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const feedCommands: BotCommand[] = [
  {
    data: mod(
      new SlashCommandBuilder()
        .setName("rss")
        .setDescription("Subscribe a channel to an RSS/Atom feed (YouTube, GitHub releases, blogs…)")
        .addSubcommand((s) => s.setName("add").setDescription("Add a feed").addStringOption((o) => o.setName("url").setDescription("Feed URL").setRequired(true)).addChannelOption((o) => o.setName("channel").setDescription("Channel to post to").setRequired(true).addChannelTypes(ChannelType.GuildText)))
        .addSubcommand((s) => s.setName("remove").setDescription("Remove a feed").addStringOption((o) => o.setName("id").setDescription("Feed ID from /rss list").setRequired(true)))
        .addSubcommand((s) => s.setName("list").setDescription("List feeds for this server"))
    ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const db = getDb();
      const gid = interaction.guildId!;
      if (sub === "add") {
        const url = interaction.options.getString("url", true);
        const channel = interaction.options.getChannel("channel", true);
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          await errReply(interaction, "Bad URL", "That doesn't look like a valid URL.");
          return;
        }
        if (!/^https?:$/.test(parsed.protocol)) {
          await errReply(interaction, "Bad URL", "Use http(s).");
          return;
        }
        await db.insert(rssFeeds).values({ id: uid("feed_"), guildId: gid, channelId: channel.id, url });
        await okReply(interaction, "Feed added", `Subscribed ${channel} to **${feedLabel(url)}**. New posts arrive within ~5 minutes.`);
        return;
      }
      if (sub === "remove") {
        const id = interaction.options.getString("id", true);
        const del = await db.delete(rssFeeds).where(and(eq(rssFeeds.id, id), eq(rssFeeds.guildId, gid)));
        if ((del as unknown as { count: number }).count > 0) await okReply(interaction, "Feed removed", `Removed \`${id}\`.`);
        else await errReply(interaction, "Not found", "That feed doesn't exist here.");
        return;
      }
      const list = await db.select().from(rssFeeds).where(eq(rssFeeds.guildId, gid));
      if (list.length === 0) {
        await infoReply(interaction, "No feeds", "Add one with `/rss add`. Example YouTube feed: `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>`");
        return;
      }
      await okReply(interaction, `Feeds (${list.length})`, list.map((f) => `\`${f.id}\` → <#${f.channelId}> · ${feedLabel(f.url)}`).join("\n"));
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("birthday")
      .setDescription("Set your birthday or configure announcements")
      .addSubcommand((s) => s.setName("set").setDescription("Set your birthday").addIntegerOption((o) => o.setName("month").setDescription("Month (1-12)").setRequired(true).setMinValue(1).setMaxValue(12)).addIntegerOption((o) => o.setName("day").setDescription("Day (1-31)").setRequired(true).setMinValue(1).setMaxValue(31)))
      .addSubcommand((s) => s.setName("remove").setDescription("Remove your birthday"))
      .addSubcommand((s) => s.setName("list").setDescription("List birthdays in this server"))
      .addSubcommand((s) => s.setName("channel").setDescription("Where to announce (Manage Server)").addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true).addChannelTypes(ChannelType.GuildText))),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const db = getDb();
      const gid = interaction.guildId!;
      if (sub === "set") {
        const month = interaction.options.getInteger("month", true);
        const day = interaction.options.getInteger("day", true);
        const maxDays = new Date(2000, month, 0).getDate();
        if (day > maxDays) {
          await errReply(interaction, "Bad date", `Month ${month} only has up to ${maxDays} days.`);
          return;
        }
        await db
          .insert(birthdays)
          .values({ guildId: gid, userId: interaction.user.id, month, day })
          .onConflictDoUpdate({ target: [birthdays.guildId, birthdays.userId], set: { month, day } });
        await okReply(interaction, "Birthday saved", `Noted: **${month}/${day}** (announced server-time).`);
        return;
      }
      if (sub === "remove") {
        await db.delete(birthdays).where(and(eq(birthdays.guildId, gid), eq(birthdays.userId, interaction.user.id)));
        await okReply(interaction, "Birthday removed", "Done.");
        return;
      }
      if (sub === "channel") {
        const channel = interaction.options.getChannel("channel", true);
        await updateSettings(gid, { birthdayChannel: channel.id });
        await okReply(interaction, "Birthday channel set", `Announcements go to ${channel}.`);
        return;
      }
      const list = await db.select().from(birthdays).where(eq(birthdays.guildId, gid));
      if (list.length === 0) {
        await infoReply(interaction, "No birthdays", "Nobody has registered one yet.");
        return;
      }
      const s = await getSettings(gid);
      const header = s?.birthdayChannel ? `Announcements: <#${s.birthdayChannel}>` : "*No announcement channel set.*";
      const lines = list.slice(0, 20).map((b) => `<@${b.userId}> — ${b.month}/${b.day}`);
      await okReply(interaction, `Birthdays (${list.length})`, `${header}\n\n${lines.join("\n")}`);
    },
  },

  {
    data: mod(
      new SlashCommandBuilder()
        .setName("tempvoice")
        .setDescription("Temporary voice channels: joining the lobby creates your own channel")
        .addSubcommand((s) => s.setName("setup").setDescription("Set the lobby channel and category").addChannelOption((o) => o.setName("lobby").setDescription("Voice channel that creates a temp channel when joined").setRequired(true).addChannelTypes(ChannelType.GuildVoice)).addChannelOption((o) => o.setName("category").setDescription("Category for temp channels").setRequired(true).addChannelTypes(ChannelType.GuildCategory)).addStringOption((o) => o.setName("name").setDescription("Name template — {username} expands").setMaxLength(100)))
        .addSubcommand((s) => s.setName("disable").setDescription("Turn tempvoice off"))
        .addSubcommand((s) => s.setName("status").setDescription("Show tempvoice config"))
    ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "setup") {
        const lobby = interaction.options.getChannel("lobby", true);
        const category = interaction.options.getChannel("category", true);
        const name = interaction.options.getString("name") ?? "{username}'s channel";
        await updateSettings(interaction.guildId!, { tempvoiceLobby: lobby.id, tempvoiceCategory: category.id, tempvoiceName: name });
        await okReply(interaction, "Tempvoice ready", `Joining ${lobby} now spawns a personal channel in **${category.name}** named \`${name}\`.`);
        return;
      }
      if (sub === "disable") {
        await updateSettings(interaction.guildId!, { tempvoiceLobby: null, tempvoiceCategory: null });
        await okReply(interaction, "Tempvoice off", "Disabled.");
        return;
      }
      const s = await getSettings(interaction.guildId!);
      await infoReply(
        interaction,
        "Tempvoice",
        s?.tempvoiceLobby ? `**Lobby:** <#${s.tempvoiceLobby}>\n**Category:** <#${s.tempvoiceCategory}>\n**Name:** \`${s.tempvoiceName}\`` : "Tempvoice is **off**. `/tempvoice setup` to enable."
      );
    },
  },

  {
    data: mod(
      new SlashCommandBuilder()
        .setName("antialt")
        .setDescription("Restrict accounts newer than N days from joining")
        .addIntegerOption((o) => o.setName("days").setDescription("Minimum account age in days (0 = off)").setRequired(true).setMinValue(0).setMaxValue(365))
    ),
    async execute(interaction) {
      const days = interaction.options.getInteger("days", true);
      await updateSettings(interaction.guildId!, { antialtDays: days });
      await okReply(interaction, "Anti-alt updated", days > 0 ? `Accounts newer than **${days} day(s)** will be removed on join.` : "Anti-alt is **off**.");
    },
  },
];