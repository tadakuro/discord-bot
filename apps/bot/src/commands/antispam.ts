import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getSettings, updateSettings } from "../lib/store.js";
import type { AntiSpamConfig } from "@dcbot/db";
import { C, makeEmbed, okReply, errReply, infoReply } from "../lib/embeds.js";
import type { BotCommand } from "./index.js";

export const antispamCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("antispam")
      .setDescription("Configure anti-spam protection")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName("toggle")
          .setDescription("Turn anti-spam on/off")
          .addBooleanOption((o) => o.setName("enabled").setDescription("Master switch").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("limit")
          .setDescription("How many messages count as spam (3-30)")
          .addIntegerOption((o) => o.setName("count").setDescription("Messages within the window").setRequired(true).setMinValue(3).setMaxValue(30))
      )
      .addSubcommand((s) =>
        s
          .setName("window")
          .setDescription("Time window for the spam limit (1-30 seconds)")
          .addIntegerOption((o) => o.setName("seconds").setDescription("Window length").setRequired(true).setMinValue(1).setMaxValue(30))
      )
      .addSubcommand((s) =>
        s
          .setName("action")
          .setDescription("What happens when someone spams")
          .addStringOption((o) => o.setName("action").setDescription("Action").setRequired(true).addChoices(
            { name: "Delete messages", value: "delete" },
            { name: "Delete + warn", value: "warn" },
            { name: "Delete + timeout", value: "timeout" }
          ))
      )
      .addSubcommand((s) =>
        s
          .setName("timeout")
          .setDescription("Timeout length in minutes (used by timeout action)")
          .addIntegerOption((o) => o.setName("minutes").setDescription("Duration").setRequired(true).setMinValue(1).setMaxValue(40320))
      )
      .addSubcommandGroup((g) =>
        g
          .setName("exempt")
          .setDescription("Manage roles exempt from anti-spam")
          .addSubcommand((ss) => ss.setName("add").setDescription("Exempt a role").addRoleOption((o) => o.setName("role").setDescription("Role to exempt").setRequired(true)))
          .addSubcommand((ss) => ss.setName("remove").setDescription("Stop exempting a role").addRoleOption((o) => o.setName("role").setDescription("Role to stop exempting").setRequired(true)))
          .addSubcommand((ss) => ss.setName("list").setDescription("List exempt roles"))
      )
      .addSubcommand((s) => s.setName("status").setDescription("Show anti-spam settings")),
    async execute(interaction) {
      const gid = interaction.guildId!;
      const sub = interaction.options.getSubcommand();
      const s = await getSettings(gid);
      const current: AntiSpamConfig = s?.antispam ?? {};
      const amEmbed = (title: string, desc: string) => makeEmbed(C.automod, title, desc);

      if (sub === "toggle") {
        const enabled = interaction.options.getBoolean("enabled", true);
        await updateSettings(gid, { antispam: { ...current, enabled } });
        await okReply(interaction, "Anti-spam updated", `Anti-spam is now **${enabled ? "ON" : "OFF"}**.`);
      } else if (sub === "limit") {
        const count = interaction.options.getInteger("count", true);
        await updateSettings(gid, { antispam: { ...current, limit: count } });
        await okReply(interaction, "Anti-spam updated", `Spam threshold is now **${count} messages** per window.`);
      } else if (sub === "window") {
        const seconds = interaction.options.getInteger("seconds", true);
        await updateSettings(gid, { antispam: { ...current, windowSecs: seconds } });
        await okReply(interaction, "Anti-spam updated", `Spam window is now **${seconds} seconds**.`);
      } else if (sub === "action") {
        const action = interaction.options.getString("action", true) as "delete" | "warn" | "timeout";
        await updateSettings(gid, { antispam: { ...current, action } });
        await okReply(interaction, "Anti-spam updated", `Spammers are now **${action === "delete" ? "deleted only" : action === "warn" ? "deleted + warned" : "deleted + timed out"}**.`);
      } else if (sub === "timeout") {
        const minutes = interaction.options.getInteger("minutes", true);
        await updateSettings(gid, { antispam: { ...current, timeoutMins: minutes } });
        await okReply(interaction, "Anti-spam updated", `Timeout action will last **${minutes} minutes**.`);
      } else if (sub === "exempt") {
        const group = interaction.options.getSubcommandGroup()!;
        const role = interaction.options.getRole("role");
        const roles = [...(current.exemptRoles ?? [])];
        if (group === "add") {
          if (!role) return;
          if (roles.includes(role.id)) {
            await infoReply(interaction, "Already exempt", `<@&${role.id}> is already exempt.`);
            return;
          }
          roles.push(role.id);
          await updateSettings(gid, { antispam: { ...current, exemptRoles: roles } });
          await okReply(interaction, "Role exempted", `<@&${role.id}> will be ignored by anti-spam.`);
        } else if (group === "remove") {
          if (!role) return;
          const filtered = roles.filter((r) => r !== role.id);
          await updateSettings(gid, { antispam: { ...current, exemptRoles: filtered } });
          if (filtered.length === roles.length) {
            await infoReply(interaction, "Not exempt", `<@&${role.id}> wasn't exempt.`);
          } else {
            await okReply(interaction, "Exemption removed", `<@&${role.id}> is no longer exempt.`);
          }
        } else {
          if (roles.length === 0) {
            await infoReply(interaction, "No exempt roles", "No roles are exempt from anti-spam.");
            return;
          }
          await infoReply(interaction, "Exempt roles", roles.map((r) => `<@&${r}>`).join("\n"));
        }
      } else {
        const lines = [
          `**Enabled:** ${current.enabled ? "yes" : "no"}`,
          `**Limit:** ${current.limit ?? 5} messages per ${current.windowSecs ?? 5} seconds`,
          `**Action:** ${current.action ?? "warn"}${current.action === "timeout" ? ` (${current.timeoutMins ?? 10} min)` : ""}`,
          `**Exempt roles:** ${current.exemptRoles?.length ? current.exemptRoles.map((r) => `<@&${r}>`).join(", ") : "none"}`,
        ];
        await infoReply(interaction, "Anti-spam config", lines.join("\n"));
      }
    },
  },
];