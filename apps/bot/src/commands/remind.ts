import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getDb } from "../lib/store.js";
import { reminders } from "@dcbot/db";
import { eq, and, gt } from "drizzle-orm";
import { uid } from "../lib/uid.js";
import { C, makeEmbed, okReply, errReply, infoReply } from "../lib/embeds.js";
import { parseDuration, formatDuration } from "../lib/web.js";
import type { BotCommand } from "./index.js";

export const remindCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("remind")
      .setDescription("Schedule a reminder (DMed to you)")
      .addSubcommand((s) =>
        s
          .setName("set")
          .setDescription("Set a reminder")
          .addStringOption((o) => o.setName("when").setDescription("e.g. 10m, 2h, 1d, 90m (max 90 days)").setRequired(true))
          .addStringOption((o) => o.setName("what").setDescription("What to remind you about").setRequired(true))
      )
      .addSubcommand((s) => s.setName("list").setDescription("List your pending reminders"))
      .addSubcommand((s) => s.setName("delete").setDescription("Delete a reminder").addStringOption((o) => o.setName("id").setDescription("Reminder ID from /remind list").setRequired(true))),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const db = getDb();
      if (sub === "set") {
        const ms = parseDuration(interaction.options.getString("when", true));
        if (!ms) {
          await errReply(interaction, "Bad duration", "Use something like `30m`, `2h`, `1d`, or `90m`. Max 90 days.");
          return;
        }
        if (ms < 20_000) {
          await errReply(interaction, "Too short", "Give it at least 20 seconds.");
          return;
        }
        const when = new Date(Date.now() + ms);
        const id = uid("rmd_");
        await db.insert(reminders).values({
          id,
          userId: interaction.user.id,
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          text: interaction.options.getString("what", true),
          remindAt: when,
        });
        await okReply(interaction, "Reminder set", `I'll DM you in **${formatDuration(ms)}** (${when.toISOString().slice(0, 16)} UTC).\n\`${interaction.options.getString("what")}\`\nYour ID: \`${id}\``);
        return;
      }
      if (sub === "list") {
        const rows = await db
          .select()
          .from(reminders)
          .where(and(eq(reminders.userId, interaction.user.id), gt(reminders.remindAt, new Date())));
        if (rows.length === 0) {
          await infoReply(interaction, "No reminders", "You have no pending reminders. Use `/remind set`.");
          return;
        }
        const lines = rows.slice(0, 20).map((r) => `\`${r.id}\` · <t:${Math.floor(r.remindAt.getTime() / 1000)}:R> — ${r.text.slice(0, 60)}`);
        await infoReply(interaction, `Reminders (${rows.length})`, lines.join("\n"));
        return;
      }
      const id = interaction.options.getString("id", true);
      const del = await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, interaction.user.id)));
      if ((del as unknown as { count: number }).count > 0) await okReply(interaction, "Reminder removed", `Deleted \`${id}\`.`);
      else await errReply(interaction, "Not found", "That reminder doesn't exist or isn't yours.");
    },
  },
];