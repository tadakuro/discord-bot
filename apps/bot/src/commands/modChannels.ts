import {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
  type VoiceChannel,
  type ThreadChannel,
  type GuildChannel,
} from "discord.js";
import { okReply, errReply, infoReply } from "../lib/embeds.js";
import type { BotCommand } from "./index.js";

type AnyBuilder = SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
const mod = (b: AnyBuilder) => (b as SlashCommandBuilder).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);
const voiceMod = (b: AnyBuilder) => (b as SlashCommandBuilder).setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers);
const lockdownRestore = new Map<string, Map<string, number>>();

export const modChannelCommands: BotCommand[] = [
  {
    data: mod(
      new SlashCommandBuilder()
        .setName("thread")
        .setDescription("Create and manage threads")
        .addSubcommand((s) =>
          s
            .setName("create")
            .setDescription("Create a thread in a channel")
            .addChannelOption((o) => o.setName("channel").setDescription("Channel to create it in").setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addStringOption((o) => o.setName("name").setDescription("Thread name").setRequired(true))
            .addStringOption((o) => o.setName("message").setDescription("First message"))
        )
        .addSubcommand((s) => s.setName("archive").setDescription("Archive a thread").addChannelOption((o) => o.setName("thread").setDescription("Thread to archive").setRequired(true).addChannelTypes(ChannelType.GuildPublicThread, ChannelType.GuildPrivateThread, ChannelType.GuildNewsThread)))
        .addSubcommand((s) => s.setName("unarchive").setDescription("Unarchive a thread").addChannelOption((o) => o.setName("thread").setDescription("Thread to unarchive").setRequired(true).addChannelTypes(ChannelType.GuildPublicThread, ChannelType.GuildPrivateThread, ChannelType.GuildNewsThread)))
        .addSubcommand((s) => s.setName("rename").setDescription("Rename a thread").addChannelOption((o) => o.setName("thread").setDescription("Thread to rename").setRequired(true).addChannelTypes(ChannelType.GuildPublicThread, ChannelType.GuildPrivateThread, ChannelType.GuildNewsThread)).addStringOption((o) => o.setName("name").setDescription("New name").setRequired(true)))
        .addSubcommand((s) => s.setName("lock").setDescription("Lock a thread").addChannelOption((o) => o.setName("thread").setDescription("Thread to lock").setRequired(true).addChannelTypes(ChannelType.GuildPublicThread, ChannelType.GuildPrivateThread, ChannelType.GuildNewsThread)))
    ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "create") {
        const channel = interaction.options.getChannel("channel", true) as TextChannel;
        const name = interaction.options.getString("name", true);
        const content = interaction.options.getString("message");
        const created = await channel.threads.create({ name });
        if (content) await created.send(content).catch(() => {});
        await okReply(interaction, "Thread created", `Created ${created}.`);
        return;
      }
      const thread = interaction.options.getChannel("thread", true) as unknown as ThreadChannel;
      const upd = sub === "archive" ? thread.setArchived(true) : sub === "unarchive" ? thread.setArchived(false) : sub === "lock" ? thread.setLocked(true) : thread.setName(interaction.options.getString("name", true));
      await upd;
      await okReply(interaction, "Thread updated", `${thread} was **${sub}**d.`);
    },
  },

  {
    data: mod(
      new SlashCommandBuilder()
        .setName("channel")
        .setDescription("Create or edit server channels")
        .addSubcommand((s) =>
          s
            .setName("create")
            .setDescription("Create a channel")
            .addStringOption((o) => o.setName("name").setDescription("Channel name").setRequired(true))
            .addStringOption((o) => o.setName("type").setDescription("Type").addChoices(
              { name: "Text", value: "text" },
              { name: "Voice", value: "voice" },
              { name: "Announcement", value: "news" }
            ))
            .addChannelOption((o) => o.setName("category").setDescription("Parent category").addChannelTypes(ChannelType.GuildCategory))
        )
        .addSubcommand((s) => s.setName("delete").setDescription("Delete a channel").addChannelOption((o) => o.setName("channel").setDescription("Channel to delete").setRequired(true)))
        .addSubcommand((s) => s.setName("rename").setDescription("Rename a channel").addChannelOption((o) => o.setName("channel").setDescription("Channel to rename").setRequired(true)).addStringOption((o) => o.setName("name").setDescription("New name").setRequired(true)))
        .addSubcommand((s) => s.setName("topic").setDescription("Set a channel topic").addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)).addStringOption((o) => o.setName("text").setDescription("New topic").setRequired(true)))
    ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "create") {
        const name = interaction.options.getString("name", true);
        const type = (interaction.options.getString("type") ?? "text") as "text" | "voice" | "news";
        const category = interaction.options.getChannel("category");
        const created = await interaction.guild!.channels.create({
          name,
          parent: category?.id,
          ...(type === "text" ? { type: ChannelType.GuildText } : type === "news" ? { type: ChannelType.GuildAnnouncement } : { type: ChannelType.GuildVoice }),
        });
        await okReply(interaction, "Channel created", `Created ${created}.`);
        return;
      }
      const channel = interaction.options.getChannel("channel", true) as GuildChannel;
      if (sub === "delete") {
        await channel.delete();
        await okReply(interaction, "Channel deleted", `Deleted **${channel.name}**.`);
        return;
      }
      if (sub === "rename") {
        await channel.setName(interaction.options.getString("name", true));
        await okReply(interaction, "Channel renamed", `${channel} was renamed.`);
        return;
      }
      await (channel as TextChannel).setTopic(interaction.options.getString("text", true));
      await okReply(interaction, "Channel topic set", `${channel} topic updated.`);
    },
  },

  {
    data: voiceMod(
      new SlashCommandBuilder()
        .setName("voice")
        .setDescription("Moderate voice channels")
        .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true).addChoices(
          { name: "Disconnect", value: "disconnect" },
          { name: "Move", value: "move" },
          { name: "Mute", value: "mute" },
          { name: "Unmute", value: "unmute" },
          { name: "Deafen", value: "deafen" },
          { name: "Undeafen", value: "undeafen" }
        ))
        .addUserOption((o) => o.setName("user").setDescription("Member in voice").setRequired(true))
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to move them to (for move)"))
    ),
    async execute(interaction) {
      const action = interaction.options.getString("action", true);
      const user = interaction.options.getUser("user", true);
      const target = await interaction.guild!.members.fetch(user.id).catch(() => null);
      if (!target) {
        await errReply(interaction, "Member not found", "That member is not here.");
        return;
      }
      try {
        if (action === "disconnect") await target.voice.disconnect();
        else if (action === "move") {
          const channel = interaction.options.getChannel("channel");
          if (!channel || channel.type !== ChannelType.GuildVoice) {
            await errReply(interaction, "Bad channel", "Pick a voice channel to move to.");
            return;
          }
          await target.voice.setChannel(channel as VoiceChannel);
        } else await target.voice.setMute(action === "mute");
        void (action === "deafen" || action === "undeafen" ? target.voice.setDeaf(action === "deafen") : null);
        await okReply(interaction, "Voice action done", `**${user.tag}** was **${action}**${action === "disconnect" ? "ed" : ""}.`);
      } catch (err) {
        await errReply(interaction, "Failed", "Could not perform that action on the member.");
      }
    },
  },

  {
    data: mod(
      new SlashCommandBuilder()
        .setName("lockdown")
        .setDescription("Slowlock every text channel (raid mode)")
        .addStringOption((o) => o.setName("toggle").setDescription("on/off").setRequired(true).addChoices({ name: "on", value: "on" }, { name: "off", value: "off" }))
        .addIntegerOption((o) => o.setName("slowmode").setDescription("Seconds of slowmode when on (default 15)"))
    ),
    async execute(interaction) {
      const toggle = interaction.options.getString("toggle", true);
      const guild = interaction.guild!;
      if (toggle === "on") {
        const sm = Math.min(Math.max(interaction.options.getInteger("slowmode") ?? 15, 1), 21600);
        const prev = new Map<string, number>();
        const texts = guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread());
        for (const c of texts.values()) {
          const t = c as TextChannel;
          prev.set(t.id, t.rateLimitPerUser);
          await t.setRateLimitPerUser(sm).catch(() => {});
        }
        lockdownRestore.set(guild.id, prev);
        await okReply(interaction, "Lockdown ON", `Set ${texts.size} channels to ${sm}s slowmode. Moderators can still chat by removing the slowmode.`);
        return;
      }
      const prev = lockdownRestore.get(guild.id);
      if (prev) {
        for (const [id, rate] of prev) {
          const c = guild.channels.cache.get(id) as TextChannel | undefined;
          if (c?.isTextBased()) await c.setRateLimitPerUser(rate).catch(() => {});
        }
      }
      const texts = guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread());
      for (const c of texts.values()) await (c as TextChannel).setRateLimitPerUser(0).catch(() => {});
      lockdownRestore.delete(guild.id);
      await okReply(interaction, "Lockdown OFF", "Slowmode removed.");
    },
  },
];