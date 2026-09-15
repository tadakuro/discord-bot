import { SlashCommandBuilder, EmbedBuilder, ChannelType, ButtonStyle, ActionRowBuilder, ButtonBuilder, PermissionFlagsBits, type ChatInputCommandInteraction, type Client, type TextChannel } from "discord.js";
import { getDb, updateSettings, getSettings } from "../lib/store.js";
import { giveaways } from "@dcbot/db";
import { eq, and } from "drizzle-orm";
import { uid } from "../lib/uid.js";
import { C, makeEmbed, okReply, errReply, infoReply } from "../lib/embeds.js";
import { parseDuration, formatDuration } from "../lib/web.js";
import { concludeGiveaway } from "../lib/jobs.js";
import type { BotCommand } from "./index.js";

export const TICKET_OPEN_ID = "dcbot_ticket_open";
export const VERIFY_ID = "dcbot_verify";

const GIVEAWAY_EMOJI = "🎉";

function parseRef(raw: string): { channelId: string; messageId: string } | null {
  const m = raw.match(/channels\/(\d+)\/(\d+)/) ?? raw.match(/^(\d{17,21})-(\d{17,21})$/);
  return m ? { channelId: m[1], messageId: m[2] } : null;
}

export const engagementCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("suggest")
      .setDescription("Submit a suggestion or configure the suggestion channel")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addSubcommand((s) => s.setName("send").setDescription("Post a suggestion").addStringOption((o) => o.setName("suggestion").setDescription("Your suggestion").setRequired(true)))
      .addSubcommand((s) => s.setName("set").setDescription("Choose the suggestions channel").addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true).addChannelTypes(ChannelType.GuildText))),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "set") {
        const channel = interaction.options.getChannel("channel", true);
        await updateSettings(interaction.guildId!, { suggestionsChannel: channel.id });
        await okReply(interaction, "Suggestions channel set", `Suggestions go to ${channel}.`);
        return;
      }
      const s = await getSettings(interaction.guildId!);
      if (!s?.suggestionsChannel) {
        await errReply(interaction, "Not configured", "Ask a moderator to run `/suggest set` first.");
        return;
      }
      const channel = await interaction.guild!.channels.fetch(s.suggestionsChannel).catch(() => null);
      if (!channel || !("send" in channel)) {
        await errReply(interaction, "Not configured", "The suggestions channel isn't available.");
        return;
      }
      const text = interaction.options.getString("suggestion", true);
      const embed = new EmbedBuilder()
        .setColor(C.info)
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setDescription(text)
        .setFooter({ text: "Suggestion" })
        .setTimestamp();
      const sent = await channel.send({ embeds: [embed] });
      await sent.react("👍");
      await sent.react("👎");
      await okReply(interaction, "Suggestion posted", `Thanks! Your suggestion went to ${channel}: ${sent.url}`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("giveaway")
      .setDescription("Run giveaways")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addSubcommand((s) =>
        s
          .setName("start")
          .setDescription("Start a giveaway")
          .addStringOption((o) => o.setName("prize").setDescription("Prize description").setRequired(true))
          .addStringOption((o) => o.setName("duration").setDescription("e.g. 1h, 30m, 1d").setRequired(true))
          .addIntegerOption((o) => o.setName("winners").setDescription("Number of winners (default 1)"))
          .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: this one)").addChannelTypes(ChannelType.GuildText))
      )
      .addSubcommand((s) => s.setName("end").setDescription("End a giveaway early").addStringOption((o) => o.setName("message").setDescription("Giveaway message link or ID").setRequired(true)))
      .addSubcommand((s) => s.setName("reroll").setDescription("Pick new winners").addStringOption((o) => o.setName("message").setDescription("Giveaway message link or ID").setRequired(true))),
    async execute(interaction, client) {
      const sub = interaction.options.getSubcommand();
      const db = getDb();
      const gid = interaction.guildId!;
      if (sub === "start") {
        const ms = parseDuration(interaction.options.getString("duration", true));
        if (!ms || ms < 10_000) {
          await errReply(interaction, "Bad duration", "Use e.g. `30m`, `2h`, `1d` (min 10 seconds, max 90 days).");
          return;
        }
        const prize = interaction.options.getString("prize", true);
        const winners = interaction.options.getInteger("winners") ?? 1;
        const channel = interaction.options.getChannel("channel") ?? (interaction.channel as { id: string });
        const endsAt = new Date(Date.now() + ms);
        const embed = new EmbedBuilder()
          .setColor(C.ai)
          .setTitle("🎉 Giveaway")
          .setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n\nReact with ${GIVEAWAY_EMOJI} to enter!`);
        const id = uid("giveaway_");
        const gv = await interaction.guild!.channels.fetch(channel.id).then((c) => {
          if (!c || !("send" in c)) throw new Error("no channel");
          return c.send({ embeds: [embed] });
        }).catch(() => null);
        if (!gv) {
          await errReply(interaction, "Failed", "Could not post the giveaway.");
          return;
        }
        await gv.react(GIVEAWAY_EMOJI);
        await db.insert(giveaways).values({ id, guildId: gid, channelId: gv.channelId, messageId: gv.id, prize, winners, endsAt });
        await okReply(interaction, "Giveaway started", `${gv.url}`);
        return;
      }
      const ref = parseRef(interaction.options.getString("message", true));
      if (!ref) {
        await errReply(interaction, "Bad link", "Send the giveaway message link or channelId-messageId.");
        return;
      }
      const row = await db.select().from(giveaways).where(and(eq(giveaways.guildId, gid), eq(giveaways.messageId, ref.messageId)));
      if (row.length === 0) {
        await errReply(interaction, "Not found", "That giveaway isn't from this server.");
        return;
      }
      if (sub === "reroll") {
        await db.update(giveaways).set({ ended: false }).where(eq(giveaways.id, row[0].id));
        await concludeGiveaway(client, row[0]);
        return;
      }
      await db.update(giveaways).set({ ended: true }).where(eq(giveaways.id, row[0].id));
      await concludeGiveaway(client, row[0]);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("ticket")
      .setDescription("Run a ticket system")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName("setup")
          .setDescription("Post the ticket open button in a channel")
          .addChannelOption((o) => o.setName("channel").setDescription("Channel for the button").setRequired(true).addChannelTypes(ChannelType.GuildText))
          .addStringOption((o) => o.setName("title").setDescription("Panel title"))
      )
      .addSubcommand((s) => s.setName("close").setDescription("Close a ticket thread").addStringOption((o) => o.setName("thread").setDescription("Thread ID or link").setRequired(true)).addStringOption((o) => o.setName("reason").setDescription("Closing note")))
      .addSubcommand((s) => s.setName("add").setDescription("Add a member to a ticket").addStringOption((o) => o.setName("thread").setDescription("Thread ID or link").setRequired(true)).addUserOption((o) => o.setName("user").setDescription("Member to add").setRequired(true)))
      .addSubcommand((s) => s.setName("remove").setDescription("Remove a member from a ticket").addStringOption((o) => o.setName("thread").setDescription("Thread ID or link").setRequired(true)).addUserOption((o) => o.setName("user").setDescription("Member to remove").setRequired(true)))
      .addSubcommand((s) => s.setName("status").setDescription("Show ticket config")),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "setup") {
        const channel = interaction.options.getChannel("channel", true) as TextChannel;
        await updateSettings(interaction.guildId!, { ticketChannel: channel.id });
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(TICKET_OPEN_ID).setLabel("Open a ticket").setStyle(ButtonStyle.Primary).setEmoji("🎫")
        );
        const embed = makeEmbed(C.config, interaction.options.getString("title") ?? "Support", "Click the button below to create a ticket.");
        await channel.send({ embeds: [embed], components: [row] });
        await okReply(interaction, "Ticket system ready", `The open-ticket button is live in ${channel}.`);
        return;
      }
      if (sub === "status") {
        const s = await getSettings(interaction.guildId!);
        await infoReply(interaction, "Ticket config", s?.ticketChannel ? `**Channel:** <#${s.ticketChannel}>` : "Tickets are **off**. Run `/ticket setup`.");
        return;
      }
      const threadRaw = interaction.options.getString("thread", true);
      const threadId = threadRaw.match(/\d{17,21}/)?.[0];
      const thread = threadId ? interaction.guild!.channels.cache.get(threadId) : null;
      if (!thread || !thread.isThread()) {
        await errReply(interaction, "Not a ticket", "Could not find that thread.");
        return;
      }
      if (sub === "close") {
        await thread.setLocked(true).catch(() => {});
        await thread.setArchived(true).catch(() => {});
        await okReply(interaction, "Ticket closed", `${thread} was closed.`);
        return;
      }
      const user = interaction.options.getUser("user", true);
      if (sub === "add") await thread.members.add(user.id);
      else await thread.members.remove(user.id);
      await okReply(interaction, "Ticket updated", `<@${user.id}> was **${sub}**ed to ${thread}.`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("verify")
      .setDescription("Button-based member verification")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName("setup")
          .setDescription("Post the verify button")
          .addChannelOption((o) => o.setName("channel").setDescription("Channel for the button").setRequired(true).addChannelTypes(ChannelType.GuildText))
          .addRoleOption((o) => o.setName("role").setDescription("Role to grant on verification").setRequired(true))
          .addStringOption((o) => o.setName("message").setDescription("Panel text below the button"))
      )
      .addSubcommand((s) => s.setName("remove").setDescription("Disable verification")),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "remove") {
        await updateSettings(interaction.guildId!, { verifyRole: null, verifyChannel: null });
        await okReply(interaction, "Verification off", "Removed. Manual `/ticket setup` panels stay until deleted.");
        return;
      }
      const channel = interaction.options.getChannel("channel", true) as TextChannel;
      const role = interaction.options.getRole("role", true);
      await updateSettings(interaction.guildId!, { verifyRole: role.id, verifyChannel: channel.id });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(VERIFY_ID).setLabel("Verify").setStyle(ButtonStyle.Success).setEmoji("✅")
      );
      const embed = makeEmbed(C.success, "Verification", interaction.options.getString("message") ?? "Click the button below to gain access.");
      await channel.send({ embeds: [embed], components: [row] });
      await okReply(interaction, "Verify ready", `The verify button is live in ${channel}, granting @${role.name}.`);
    },
  },
];