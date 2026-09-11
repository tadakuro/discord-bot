import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getSettings, updateSettings } from "../lib/store.js";
import type { AutomodConfig } from "@dcbot/db";
import type { BotCommand } from "./index.js";

function statusText(automod: AutomodConfig) {
  const lines = [
    `Enabled: **${automod.enabled ? "yes" : "no"}**`,
    `Action on violation: **${automod.action === "warn" ? "delete + warn" : "delete only"}**`,
    `Blocked words: ${automod.words?.length ? automod.words.map((w) => `\`${w}\``).join(", ") : "none"}`,
    `Block invites: **${automod.invite ? "yes" : "no"}**`,
    `Block excessive caps: **${automod.caps ? `yes (≥${automod.capsPercent ?? 70}% uppercase)` : "no"}**`,
  ];
  return lines.join("\n");
}

export const automodCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("automod")
      .setDescription("Configure automatic moderation")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName("toggle")
          .setDescription("Turn auto-mod on/off")
          .addBooleanOption((o) => o.setName("enabled").setDescription("Master switch").setRequired(true))
      )
      .addSubcommandGroup((g) =>
        g
          .setName("words")
          .setDescription("Manage blocked words")
          .addSubcommand((ss) =>
            ss
              .setName("add")
              .setDescription("Block a word")
              .addStringOption((o) => o.setName("word").setDescription("Word or phrase to block").setRequired(true))
          )
          .addSubcommand((ss) =>
            ss
              .setName("remove")
              .setDescription("Unblock a word")
              .addStringOption((o) => o.setName("word").setDescription("Word to unblock").setRequired(true))
          )
          .addSubcommand((ss) => ss.setName("list").setDescription("List blocked words"))
      )
      .addSubcommand((s) =>
        s
          .setName("invite")
          .setDescription("Block Discord invite links")
          .addBooleanOption((o) => o.setName("enabled").setDescription("Block invite links").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("caps")
          .setDescription("Block excessive caps")
          .addBooleanOption((o) => o.setName("enabled").setDescription("Block excessive caps").setRequired(true))
          .addIntegerOption((o) => o.setName("percent").setDescription("Minimum %% uppercase to count (50-100)").setMinValue(50).setMaxValue(100))
      )
      .addSubcommand((s) =>
        s
          .setName("action")
          .setDescription("What to do on a violation")
          .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true).addChoices(
            { name: "Delete only", value: "delete" },
            { name: "Delete + warn", value: "warn" }
          ))
      )
      .addSubcommand((s) => s.setName("status").setDescription("Show auto-mod settings")),
    async execute(interaction) {
      const gid = interaction.guildId!;
      const sub = interaction.options.getSubcommand();
      const s = await getSettings(gid);
      const current: AutomodConfig = s?.automod ?? {};

      if (sub === "toggle") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await updateSettings(gid, { automod: { ...current, enabled } });
        await interaction.reply({ content: `Auto-mod is now **${enabled ? "ON" : "OFF"}**.`, ephemeral: true });
      } else if (sub === "words") {
        const group = interaction.options.getSubcommandGroup()!;
        const wordInput = interaction.options.getString("word");
        const words = [...(current.words ?? [])];
        const word = wordInput?.toLowerCase();
        if (group === "add") {
          if (!word) return;
          if (words.includes(word)) {
            await interaction.reply({ content: `\`${word}\` is already blocked.`, ephemeral: true });
            return;
          }
          words.push(word);
          await updateSettings(gid, { automod: { ...current, words } });
          await interaction.reply({ content: `Blocked \`${word}\`.`, ephemeral: true });
        } else if (group === "remove") {
          if (!word) return;
          const filtered = words.filter((w) => w !== word);
          await updateSettings(gid, { automod: { ...current, words: filtered } });
          await interaction.reply({ content: filtered.length === words.length ? `\`${word}\` wasn't blocked.` : `Unblocked \`${word}\`.`, ephemeral: true });
        } else {
          if (words.length === 0) {
            await interaction.reply({ content: "No blocked words.", ephemeral: true });
            return;
          }
          await interaction.reply({ content: `**Blocked words:** ${words.map((w) => `\`${w}\``).join(", ")}`, ephemeral: true });
        }
      } else if (sub === "invite") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await updateSettings(gid, { automod: { ...current, invite: enabled } });
        await interaction.reply({ content: `Invite filtering is now **${enabled ? "ON" : "OFF"}**.`, ephemeral: true });
      } else if (sub === "caps") {
        const enabled = interaction.options.getBoolean("enabled", true);
        const percent = interaction.options.getInteger("percent") ?? 70;
        await updateSettings(gid, { automod: { ...current, caps: enabled, capsPercent: percent } });
        await interaction.reply({ content: `Caps filtering is now **${enabled ? `ON (≥${percent}% uppercase)` : "OFF"}**.`, ephemeral: true });
      } else if (sub === "action") {
        const action = interaction.options.getString("action", true) as "delete" | "warn";
        await updateSettings(gid, { automod: { ...current, action } });
        await interaction.reply({ content: `Violations now **${action === "warn" ? "delete + warn" : "delete only"}**.`, ephemeral: true });
      } else {
        await interaction.reply({ content: `**Auto-mod config**\n${statusText(current)}`, ephemeral: true });
      }
    },
  },
];