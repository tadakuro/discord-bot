import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "./index.js";

const mod = PermissionFlagsBits.ModerateMembers;
const manageChannels = PermissionFlagsBits.ManageChannels;
const manageRoles = PermissionFlagsBits.ManageRoles;
const manageNicknames = PermissionFlagsBits.ManageNicknames;

export const moderationExtraCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("mute")
      .setDescription("Timeout a member (mute)")
      .setDefaultMemberPermissions(mod)
      .addUserOption((o) => o.setName("user").setDescription("Member to mute").setRequired(true))
      .addIntegerOption((o) => o.setName("minutes").setDescription("Duration in minutes").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason")),
    async execute(interaction) {
      const user = interaction.options.getUser("user", true);
      const minutes = Math.min(Math.max(interaction.options.getInteger("minutes", true), 1), 40320);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const target = await interaction.guild!.members.fetch(user.id).catch(() => null);
      if (!target) {
        await interaction.reply({ content: "Could not find that member.", ephemeral: true });
        return;
      }
      await target.timeout(minutes * 60_000, reason);
      await interaction.reply({ content: `Muted <@${user.id}> for **${minutes} minutes**. Reason: ${reason}`, ephemeral: true });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("unmute")
      .setDescription("Remove a timeout/mute from a member")
      .setDefaultMemberPermissions(mod)
      .addUserOption((o) => o.setName("user").setDescription("Member to unmute").setRequired(true)),
    async execute(interaction) {
      const user = interaction.options.getUser("user", true);
      const target = await interaction.guild!.members.fetch(user.id).catch(() => null);
      if (!target) {
        await interaction.reply({ content: "Could not find that member.", ephemeral: true });
        return;
      }
      if (!target.communicationDisabledUntilTimestamp) {
        await interaction.reply({ content: `<@${user.id}> isn't muted.`, ephemeral: true });
        return;
      }
      await target.timeout(null);
      await interaction.reply({ content: `Unmuted <@${user.id}>.`, ephemeral: true });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("slowmode")
      .setDescription("Set chat slowmode in a channel")
      .setDefaultMemberPermissions(manageChannels)
      .addIntegerOption((o) => o.setName("seconds").setDescription("Delay in seconds (0 = off, max 21600)").setRequired(true).setMinValue(0).setMaxValue(21600))
      .addChannelOption((o) => o.setName("channel").setDescription("Channel (defaults to current)")),
    async execute(interaction) {
      const seconds = interaction.options.getInteger("seconds", true);
      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      if (!channel || !("setRateLimitPerUser" in channel)) {
        await interaction.reply({ content: "Please pick a text channel.", ephemeral: true });
        return;
      }
      await channel.setRateLimitPerUser(seconds);
      await interaction.reply({ content: `Slowmode in ${channel} set to **${seconds} seconds**${seconds === 0 ? " (off)" : ""}.`, ephemeral: true });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("lock")
      .setDescription("Lock a channel (blocks sending for @everyone)")
      .setDefaultMemberPermissions(manageChannels)
      .addChannelOption((o) => o.setName("channel").setDescription("Channel to lock (defaults to current)")),
    async execute(interaction) {
      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      if (!channel || !("permissionOverwrites" in channel)) {
        await interaction.reply({ content: "Please pick a text channel.", ephemeral: true });
        return;
      }
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
      await interaction.reply({ content: `🔒 ${channel} locked.`, ephemeral: true });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("unlock")
      .setDescription("Unlock a channel")
      .setDefaultMemberPermissions(manageChannels)
      .addChannelOption((o) => o.setName("channel").setDescription("Channel to unlock (defaults to current)")),
    async execute(interaction) {
      const channel = interaction.options.getChannel("channel") ?? interaction.channel;
      if (!channel || !("permissionOverwrites" in channel)) {
        await interaction.reply({ content: "Please pick a text channel.", ephemeral: true });
        return;
      }
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: null });
      await interaction.reply({ content: `🔓 ${channel} unlocked.`, ephemeral: true });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("nick")
      .setDescription("Change a member's nickname")
      .setDefaultMemberPermissions(manageNicknames)
      .addUserOption((o) => o.setName("user").setDescription("Member to rename").setRequired(true))
      .addStringOption((o) => o.setName("nickname").setDescription("New nickname (empty resets)")),
    async execute(interaction) {
      const user = interaction.options.getUser("user", true);
      const nickname = interaction.options.getString("nickname") ?? "";
      const target = await interaction.guild!.members.fetch(user.id).catch(() => null);
      if (!target) {
        await interaction.reply({ content: "Could not find that member.", ephemeral: true });
        return;
      }
      await target.setNickname(nickname || null);
      await interaction.reply({ content: nickname ? `Renamed <@${user.id}> to **${nickname}**.` : `Reset <@${user.id}>'s nickname.`, ephemeral: true });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("role")
      .setDescription("Add or remove a role from a member")
      .setDefaultMemberPermissions(manageRoles)
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Add a role")
          .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
          .addRoleOption((o) => o.setName("role").setDescription("Role to add").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription("Remove a role")
          .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
          .addRoleOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true))
      ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const user = interaction.options.getUser("user", true);
      const role = interaction.options.getRole("role", true);
      if (role.id === interaction.guild!.id) {
        await interaction.reply({ content: "@everyone can't be assigned with this command.", ephemeral: true });
        return;
      }
      const target = await interaction.guild!.members.fetch(user.id).catch(() => null);
      if (!target) {
        await interaction.reply({ content: "Could not find that member.", ephemeral: true });
        return;
      }
      if (sub === "add") {
        if (target.roles.cache.has(role.id)) {
          await interaction.reply({ content: `<@${user.id}> already has <@&${role.id}>.`, ephemeral: true });
          return;
        }
        await target.roles.add(role.id);
        await interaction.reply({ content: `Added <@&${role.id}> to <@${user.id}>.`, ephemeral: true });
      } else {
        if (!target.roles.cache.has(role.id)) {
          await interaction.reply({ content: `<@${user.id}> doesn't have <@&${role.id}>.`, ephemeral: true });
          return;
        }
        await target.roles.remove(role.id);
        await interaction.reply({ content: `Removed <@&${role.id}> from <@${user.id}>.`, ephemeral: true });
      }
    },
  },
];