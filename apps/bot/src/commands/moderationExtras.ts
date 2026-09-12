import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { C, makeEmbed, okReply, errReply, infoReply } from "../lib/embeds.js";
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
        await errReply(interaction, "Member not found", "Could not find that member.");
        return;
      }
      await target.timeout(minutes * 60_000, reason);
      await interaction.reply({
        embeds: [
          makeEmbed(C.mod, "Member Muted", `**User:** <@${user.id}>\n**Duration:** ${minutes} minutes\n**Reason:** ${reason}`),
        ],
        ephemeral: true,
      });
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
        await errReply(interaction, "Member not found", "Could not find that member.");
        return;
      }
      if (!target.communicationDisabledUntilTimestamp) {
        await infoReply(interaction, "Not muted", `<@${user.id}> isn't muted.`);
        return;
      }
      await target.timeout(null);
      await okReply(interaction, "Member unmuted", `<@${user.id}> was unmuted.`);
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
        await errReply(interaction, "Invalid channel", "Please pick a text channel.");
        return;
      }
      await channel.setRateLimitPerUser(seconds);
      await okReply(interaction, "Slowmode set", `Slowmode in ${channel} set to **${seconds} seconds**${seconds === 0 ? " (off)" : ""}.`);
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
        await errReply(interaction, "Invalid channel", "Please pick a text channel.");
        return;
      }
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
      await okReply(interaction, "Channel locked", `🔒 ${channel} was locked.`);
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
        await errReply(interaction, "Invalid channel", "Please pick a text channel.");
        return;
      }
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: null });
      await okReply(interaction, "Channel unlocked", `🔓 ${channel} was unlocked.`);
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
        await errReply(interaction, "Member not found", "Could not find that member.");
        return;
      }
      await target.setNickname(nickname || null);
      if (nickname) {
        await okReply(interaction, "Nickname changed", `<@${user.id}> was renamed to **${nickname}**.`);
      } else {
        await okReply(interaction, "Nickname reset", `<@${user.id}>'s nickname was reset.`);
      }
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
        await errReply(interaction, "Invalid role", "@everyone can't be assigned with this command.");
        return;
      }
      const target = await interaction.guild!.members.fetch(user.id).catch(() => null);
      if (!target) {
        await errReply(interaction, "Member not found", "Could not find that member.");
        return;
      }
      if (sub === "add") {
        if (target.roles.cache.has(role.id)) {
          await infoReply(interaction, "Already assigned", `<@${user.id}> already has <@&${role.id}>.`);
          return;
        }
        await target.roles.add(role.id);
        await okReply(interaction, "Role added", `Added <@&${role.id}> to <@${user.id}>.`);
      } else {
        if (!target.roles.cache.has(role.id)) {
          await infoReply(interaction, "Role missing", `<@${user.id}> doesn't have <@&${role.id}>.`);
          return;
        }
        await target.roles.remove(role.id);
        await okReply(interaction, "Role removed", `Removed <@&${role.id}> from <@${user.id}>.`);
      }
    },
  },
];