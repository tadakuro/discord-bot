import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getDb, getSettings, updateSettings } from "../lib/store.js";
import { DEFAULT_LOG_EVENTS, autoRoles } from "@dcbot/db";
import { and, eq } from "drizzle-orm";
import { uid } from "../lib/uid.js";
import type { BotCommand } from "./index.js";

const LOG_EVENT_CHOICES = DEFAULT_LOG_EVENTS.map((e) => ({ name: e, value: e }));

export const configCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("levelconfig")
      .setDescription("Configure leveling (XP, level-up message, roles)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName("set")
          .setDescription("Update leveling settings")
          .addBooleanOption((o) => o.setName("enabled").setDescription("Turn leveling on/off"))
          .addIntegerOption((o) => o.setName("min").setDescription("Minimum XP per message (1-100)").setMinValue(1).setMaxValue(100))
          .addIntegerOption((o) => o.setName("max").setDescription("Maximum XP per message (1-1000)").setMinValue(1).setMaxValue(1000))
          .addIntegerOption((o) => o.setName("cooldown").setDescription("Seconds between XP gains (0-3600)").setMinValue(0).setMaxValue(3600))
          .addChannelOption((o) => o.setName("channel").setDescription("Channel for level-up messages (defaults to channel where the user leveled up)"))
          .addStringOption((o) => o.setName("message").setDescription("Level-up message. Use {user}, {level}, {server}"))
          .addBooleanOption((o) => o.setName("stack").setDescription("Stack all level roles instead of keeping only the highest"))
      )
      .addSubcommand((s) => s.setName("status").setDescription("Show leveling settings")),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const gid = interaction.guildId!;

      if (sub === "set") {
        const enabled = interaction.options.getBoolean("enabled");
        const min = interaction.options.getInteger("min");
        const max = interaction.options.getInteger("max");
        const cooldown = interaction.options.getInteger("cooldown");
        const channel = interaction.options.getChannel("channel");
        const message = interaction.options.getString("message");
        const stack = interaction.options.getBoolean("stack");

        if (min != null && max != null && min > max) {
          await interaction.reply({ content: "min cannot be greater than max.", ephemeral: true });
          return;
        }

        const patch: Record<string, unknown> = {};
        if (enabled != null) patch.levelingEnabled = enabled;
        if (min != null) patch.xpMin = min;
        if (max != null) patch.xpMax = max;
        if (cooldown != null) patch.xpCooldownSecs = cooldown;
        if (channel) patch.levelUpChannel = channel.id;
        if (message) patch.levelUpMessage = message;
        if (stack != null) patch.stackLevelRoles = stack;

        if (Object.keys(patch).length === 0) {
          await interaction.reply({ content: "Pick at least one setting to change, or use /levelconfig status.", ephemeral: true });
          return;
        }

        await updateSettings(gid, patch);
        await interaction.reply({ content: "Leveling settings saved.", ephemeral: true });
        return;
      }

      const s = await getSettings(gid);
      const lines = [
        `Enabled: **${s?.levelingEnabled ? "yes" : "no"}**`,
        `XP per message: **${s?.xpMin ?? 5}-${s?.xpMax ?? 15}**`,
        `Cooldown: **${s?.xpCooldownSecs ?? 60}s**`,
        `Level-up channel: ${s?.levelUpChannel ? `<#${s.levelUpChannel}>` : "default (channel where leveled up)"}`,
        `Level-up message: \`${s?.levelUpMessage ?? "-"}\``,
        `Stack level roles: **${s?.stackLevelRoles ? "yes" : "no"}**`,
      ];
      await interaction.reply({ content: `**Leveling config**\n${lines.join("\n")}`, ephemeral: true });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("logging")
      .setDescription("Configure message & member logging")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName("channel")
          .setDescription("Set the log channel")
          .addChannelOption((o) => o.setName("channel").setDescription("Channel to post logs in").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("enable")
          .setDescription("Turn logging on/off")
          .addBooleanOption((o) => o.setName("enabled").setDescription("Master switch").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("events")
          .setDescription("Enable/disable an individual log event")
          .addStringOption((o) => o.setName("event").setDescription("Log event").setRequired(true).addChoices(...LOG_EVENT_CHOICES))
          .addBooleanOption((o) => o.setName("enabled").setDescription("Turn this event on/off").setRequired(true))
      )
      .addSubcommand((s) => s.setName("status").setDescription("Show logging config")),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const gid = interaction.guildId!;
      const s = await getSettings(gid);

      if (sub === "channel") {
        const channel = interaction.options.getChannel("channel", true);
        await updateSettings(gid, { logChannel: channel.id });
        await interaction.reply({ content: `Log channel set to ${channel}.`, ephemeral: true });
      } else if (sub === "enable") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await updateSettings(gid, { loggingEnabled: enabled });
        await interaction.reply({ content: `Logging is now **${enabled ? "ON" : "OFF"}**.`, ephemeral: true });
      } else if (sub === "events") {
        const event = interaction.options.getString("event", true);
        const enabled = interaction.options.getBoolean("enabled", true);
        const current = new Set(s?.logEvents ?? []);
        if (enabled) current.add(event);
        else current.delete(event);
        await updateSettings(gid, { logEvents: [...current] });
        await interaction.reply({ content: `Log event \`${event}\` is now **${enabled ? "ON" : "OFF"}**.`, ephemeral: true });
      } else {
        const lines = [
          `Enabled: **${s?.loggingEnabled ? "yes" : "no"}**`,
          `Channel: ${s?.logChannel ? `<#${s.logChannel}>` : "**not set**"}`,
          `Events: ${(s?.logEvents ?? []).length > 0 ? (s?.logEvents ?? []).map((e) => `\`${e}\``).join(", ") : "none"}`,
        ];
        await interaction.reply({ content: `**Logging config**\n${lines.join("\n")}`, ephemeral: true });
      }
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("autorole")
      .setDescription("Automatically assign roles when members join")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand((s) => s.setName("add").setDescription("Add an auto role").addRoleOption((o) => o.setName("role").setDescription("Role to assign on join").setRequired(true)))
      .addSubcommand((s) => s.setName("remove").setDescription("Remove an auto role").addRoleOption((o) => o.setName("role").setDescription("Role to stop assigning").setRequired(true)))
      .addSubcommand((s) => s.setName("list").setDescription("List auto roles")),
    async execute(interaction) {
      const gid = interaction.guildId!;
      const sub = interaction.options.getSubcommand();
      const id = uid("ar_");

      if (sub === "add") {
        const role = interaction.options.getRole("role", true);
        if (role.id === interaction.guild!.id) {
          await interaction.reply({ content: "@everyone cannot be an auto role.", ephemeral: true });
          return;
        }
        await getDb().insert(autoRoles).values({ id, guildId: gid, roleId: role.id }).onConflictDoNothing();
        await interaction.reply({ content: `<@&${role.id}> will be assigned to new members.`, ephemeral: true });
      } else if (sub === "remove") {
        const role = interaction.options.getRole("role", true);
        const deleted = await getDb().delete(autoRoles).where(and(eq(autoRoles.guildId, gid), eq(autoRoles.roleId, role.id)));
        const removed = (deleted as unknown as { count: number }).count ?? 0;
        await interaction.reply({ content: removed > 0 ? `Removed <@&${role.id}> from auto roles.` : `No auto role set for <@&${role.id}>.`, ephemeral: true });
      } else {
        const list = await getDb().select().from(autoRoles).where(eq(autoRoles.guildId, gid));
        if (list.length === 0) {
          await interaction.reply({ content: "No auto roles configured.", ephemeral: true });
          return;
        }
        const lines = list.map((r) => `<@&${r.roleId}>`);
        await interaction.reply({ content: `**Auto roles:**\n${lines.join("\n")}`, ephemeral: true });
      }
    },
  },
];