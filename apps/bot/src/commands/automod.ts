import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getSettings, updateSettings } from "../lib/store.js";
import type { AutomodConfig } from "@dcbot/db";
import { C, makeEmbed, okReply, errReply, infoReply } from "../lib/embeds.js";
import type { BotCommand } from "./index.js";

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

      const automodEmbed = (title: string, desc: string) => makeEmbed(C.automod, title, desc);

      if (sub === "toggle") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await updateSettings(gid, { automod: { ...current, enabled } });
        await okReply(interaction, "Auto-mod updated", `Auto-mod is now **${enabled ? "ON" : "OFF"}**.`, { footer: "Auto-mod" });
      } else if (sub === "words") {
        const group = interaction.options.getSubcommandGroup()!;
        const wordInput = interaction.options.getString("word");
        const words = [...(current.words ?? [])];
        const word = wordInput?.toLowerCase();
        if (group === "add") {
          if (!word) return;
          if (words.includes(word)) {
            await infoReply(interaction, "Already blocked", `\`${word}\` is already blocked.`);
            return;
          }
          words.push(word);
          await updateSettings(gid, { automod: { ...current, words } });
          await okReply(interaction, "Word blocked", `\`${word}\` is now blocked.`);
        } else if (group === "remove") {
          if (!word) return;
          const filtered = words.filter((w) => w !== word);
          await updateSettings(gid, { automod: { ...current, words: filtered } });
          if (filtered.length === words.length) {
            await infoReply(interaction, "Not blocked", `\`${word}\` wasn't blocked.`);
          } else {
            await okReply(interaction, "Word unblocked", `\`${word}\` was unblocked.`);
          }
        } else {
          if (words.length === 0) {
            await infoReply(interaction, "No blocked words", "No blocked words configured.");
            return;
          }
          await infoReply(interaction, "Blocked words", words.map((w) => `\`${w}\``).join(", "));
        }
      } else if (sub === "invite") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await updateSettings(gid, { automod: { ...current, invite: enabled } });
        await okReply(interaction, "Invite filter updated", `Invite filtering is now **${enabled ? "ON" : "OFF"}**.`);
      } else if (sub === "caps") {
        const enabled = interaction.options.getBoolean("enabled", true);
        const percent = interaction.options.getInteger("percent") ?? 70;
        await updateSettings(gid, { automod: { ...current, caps: enabled, capsPercent: percent } });
        await okReply(interaction, "Caps filter updated", `Caps filtering is now **${enabled ? `ON (≥${percent}% uppercase)` : "OFF"}**.`);
      } else if (sub === "action") {
        const action = interaction.options.getString("action", true) as "delete" | "warn";
        await updateSettings(gid, { automod: { ...current, action } });
        await okReply(interaction, "Auto-mod action updated", `Violations now **${action === "warn" ? "delete + warn" : "delete only"}**.`);
      } else {
        const lines = [
          `**Enabled:** ${current.enabled ? "yes" : "no"}`,
          `**Action on violation:** ${current.action === "warn" ? "delete + warn" : "delete only"}`,
          `**Blocked words:** ${current.words?.length ? current.words.map((w) => `\`${w}\``).join(", ") : "none"}`,
          `**Block invites:** ${current.invite ? "yes" : "no"}`,
          `**Block excessive caps:** ${current.caps ? `yes (≥${current.capsPercent ?? 70}% uppercase)` : "no"}`,
        ];
        await infoReply(interaction, "Auto-mod config", lines.join("\n"));
      }
    },
  },
];