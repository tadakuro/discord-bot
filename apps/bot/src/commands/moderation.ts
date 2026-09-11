import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { getDb, getSettings, updateSettings } from "../lib/store.js";
import { uid } from "../lib/uid.js";
import { warns, type guildSettings } from "@dcbot/db";
import { eq, and } from "drizzle-orm";
import type { BotCommand } from "./index.js";

const requireModerator = <T extends { setDefaultMemberPermissions(permissions: unknown): T }>(builder: T): T =>
  builder.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export function actionCard(title: string, color: number, fields: [string, string, boolean?][]) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(fields.map(([name, value, inline]) => ({ name, value, inline: inline ?? false })));
}

async function getTarget(interaction: ChatInputCommandInteraction) {
  const member = interaction.member!;
  const user = interaction.options.getUser("user", true);
  const target = await interaction.guild!.members.fetch(user.id).catch(() => null);
  return { member, user, target };
}

async function notifyTarget(client: Client, userId: string, content: string) {
  const target = await client.users.fetch(userId).catch(() => null);
  if (!target) return;
  await target.send({ content }).catch(() => {});
}

async function postModLog(interaction: ChatInputCommandInteraction, embed: EmbedBuilder) {
  const s = await getSettings(interaction.guildId!);
  if (!s?.modLogChannel) return;
  const channel = await interaction.guild!.channels.fetch(s.modLogChannel).catch(() => null);
  if (!channel || !("send" in channel)) return;
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function applyWarnPunishment(
  interaction: ChatInputCommandInteraction,
  client: Client,
  targetId: string,
  reason: string,
  settings: typeof guildSettings.$inferSelect
) {
  const limit = settings.warnLimit ?? 0;
  if (limit <= 0) return;

  const db = getDb();
  const activeCount = (await db
    .select()
    .from(warns)
    .where(and(eq(warns.guildId, interaction.guildId!), eq(warns.userId, targetId), eq(warns.active, true)))).length;

  if (activeCount < limit) return;

  const action = settings.warnAction ?? "timeout";
  const mention = `<@${targetId}>`;
  const reasonText = `Auto-punishment at ${activeCount}/${limit} warnings: ${reason}`;
  const target = await interaction.guild!.members.fetch(targetId).catch(() => null);

  let actionName = "no action";
  if (action === "timeout") {
    const mins = settings.warnTimeoutMins ?? 10;
    await target?.timeout(Math.min(mins, 28 * 24 * 60) * 60_000, reasonText).catch(() => {});
    actionName = `timed out ${mins} minutes`;
  } else if (action === "kick") {
    await target?.kick(reasonText).catch(() => {});
    actionName = "kicked";
  } else if (action === "ban") {
    await target?.ban({ reason: reasonText }).catch(() => {});
    actionName = "banned";
  }
  await notifyTarget(client, targetId, `You've reached **${limit} warnings** and were **${actionName}** on ${interaction.guild!.name}.`);
  await interaction.followUp({ content: `${mention} hit the **${limit}-warn limit** and was **${actionName}**.`, ephemeral: true });
}

export const moderationCommands: BotCommand[] = [
  {
    data: requireModerator(
      new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a member from the server")
        .addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason for the kick"))
    ),
    async execute(interaction, client) {
      const { target, user } = await getTarget(interaction);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      if (!target) {
        await interaction.reply({ content: "Could not find that member.", ephemeral: true });
        return;
      }
      await target.kick(reason);
      const embed = actionCard("Member Kicked", 0xffa500, [["User", `<@${user.id}>`], ["Reason", reason]]);
      await interaction.reply({ embeds: [embed] });
      await postModLog(interaction, embed);
      const s = await getSettings(interaction.guildId!);
      if (s?.modDmUser) await notifyTarget(client, user.id, `You were **kicked** from ${interaction.guild!.name}.\n**Reason:** ${reason}`);
    },
  },

  {
    data: requireModerator(
      new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a member from the server")
        .addUserOption((o) => o.setName("user").setDescription("Member to ban").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason for the ban"))
    ),
    async execute(interaction, client) {
      const { target, user } = await getTarget(interaction);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      if (!target) {
        await interaction.reply({ content: "Could not find that member.", ephemeral: true });
        return;
      }
      await target.ban({ reason });
      const embed = actionCard("Member Banned", 0xff0000, [["User", `<@${user.id}>`], ["Reason", reason]]);
      await interaction.reply({ embeds: [embed] });
      await postModLog(interaction, embed);
      const s = await getSettings(interaction.guildId!);
      if (s?.modDmUser) await notifyTarget(client, user.id, `You were **banned** from ${interaction.guild!.name}.\n**Reason:** ${reason}`);
    },
  },

  {
    data: requireModerator(
      new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Unban a user from the server")
        .addUserOption((o) => o.setName("user").setDescription("User to unban").setRequired(true))
    ),
    async execute(interaction) {
      const user = interaction.options.getUser("user", true);
      await interaction.guild!.bans.remove(user.id);
      const embed = actionCard("User Unbanned", 0x00ff00, [["User", `<@${user.id}>`]]);
      await interaction.reply({ embeds: [embed] });
      await postModLog(interaction, embed);
    },
  },

  {
    data: requireModerator(
      new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout a member for a duration")
        .addUserOption((o) => o.setName("user").setDescription("Member to timeout").setRequired(true))
        .addIntegerOption((o) => o.setName("minutes").setDescription("Timeout length in minutes").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason"))
    ),
    async execute(interaction, client) {
      const { target, user } = await getTarget(interaction);
      const minutes = interaction.options.getInteger("minutes", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      if (!target) {
        await interaction.reply({ content: "Could not find that member.", ephemeral: true });
        return;
      }
      const ms = minutes * 60_000;
      if (ms > 28 * 24 * 3600 * 1000) {
        await interaction.reply({ content: "Timeout cannot exceed 28 days.", ephemeral: true });
        return;
      }
      await target.timeout(ms, reason);
      const embed = actionCard("Member Timed Out", 0xff8c00, [["User", `<@${user.id}>`], ["Duration", `${minutes} minutes`], ["Reason", reason]]);
      await interaction.reply({ embeds: [embed] });
      await postModLog(interaction, embed);
      const s = await getSettings(interaction.guildId!);
      if (s?.modDmUser) await notifyTarget(client, user.id, `You were **timed out** for ${minutes} minutes in ${interaction.guild!.name}.\n**Reason:** ${reason}`);
    },
  },

  {
    data: requireModerator(
      new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a member")
        .addUserOption((o) => o.setName("user").setDescription("Member to warn").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason for the warning"))
    ),
    async execute(interaction, client) {
      const { target, user } = await getTarget(interaction);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      if (!target) {
        await interaction.reply({ content: "Could not find that member.", ephemeral: true });
        return;
      }
      const db = getDb();
      const id = uid("warn_");
      await db.insert(warns).values({
        id,
        guildId: interaction.guildId!,
        userId: user.id,
        moderatorId: interaction.user.id,
        reason,
      });
      const embed = actionCard("Member Warned", 0xffcc00, [["User", `<@${user.id}>`], ["Reason", reason]]);
      await interaction.reply({ embeds: [embed] });
      await postModLog(interaction, embed);
      const s = await getSettings(interaction.guildId!);
      if (s?.modDmUser) await notifyTarget(client, user.id, `You were **warned** in ${interaction.guild!.name}.\n**Reason:** ${reason}`);
      await applyWarnPunishment(interaction, client, user.id, reason, s!);
    },
  },

  {
    data: requireModerator(
      new SlashCommandBuilder()
        .setName("warns")
        .setDescription("List or clear warnings")
        .addSubcommand((s) =>
          s
            .setName("list")
            .setDescription("List warnings for a member")
            .addUserOption((o) => o.setName("user").setDescription("Member to check").setRequired(true))
        )
        .addSubcommand((s) =>
          s
            .setName("clear")
            .setDescription("Clear all active warnings for a member")
            .addUserOption((o) => o.setName("user").setDescription("Member to clear").setRequired(true))
        )
    ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const user = interaction.options.getUser("user", true);
      const db = getDb();
      const gid = interaction.guildId!;

      if (sub === "clear") {
        const updated = await db
          .update(warns)
          .set({ active: false })
          .where(and(eq(warns.guildId, gid), eq(warns.userId, user.id), eq(warns.active, true)));
        await interaction.reply({ content: `Cleared **${((updated as unknown as { count: number }).count) ?? 0}** warning(s) for <@${user.id}>.`, ephemeral: true });
        return;
      }

      const list = await db
        .select()
        .from(warns)
        .where(and(eq(warns.guildId, gid), eq(warns.userId, user.id), eq(warns.active, true)));
      if (list.length === 0) {
        await interaction.reply({ content: `**<@${user.id}>** has no warnings.`, ephemeral: true });
        return;
      }
      const fields = list.slice(0, 15).map((w) => [`#${w.id.replace("warn_", "")} — ${w.createdAt.toISOString().slice(0, 10)}`, `${w.reason ?? "No reason"} (by <@${w.moderatorId}>)`] as [string, string]);
      await interaction.reply({
        embeds: [actionCard(`Warnings for ${user.tag} — ${list.length}`, 0xffcc00, fields)],
      });
    },
  },

  {
    data: requireModerator(
      new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Delete a number of messages in the channel")
        .addIntegerOption((o) => o.setName("count").setDescription("Number of messages to delete (1-100)").setRequired(true))
    ),
    async execute(interaction) {
      const count = Math.min(Math.max(interaction.options.getInteger("count", true), 1), 100);
      if (!interaction.channel || !("bulkDelete" in interaction.channel)) {
        await interaction.reply({ content: "Cannot purge messages here.", ephemeral: true });
        return;
      }
      const deleted = await interaction.channel.bulkDelete(count, true);
      await interaction.reply({ content: `Deleted **${deleted.size}** messages.`, ephemeral: true });
    },
  },

  {
    data: requireModerator(
      new SlashCommandBuilder()
        .setName("warnconfig")
        .setDescription("Configure warnings & moderation behavior")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Update warn settings")
            .addIntegerOption((o) => o.setName("limit").setDescription("Warnings before auto-action (0 = disabled)").setMinValue(0).setMaxValue(50))
            .addStringOption((o) => o.setName("action").setDescription("Auto-action at the limit").addChoices(
              { name: "Timeout", value: "timeout" },
              { name: "Kick", value: "kick" },
              { name: "Ban", value: "ban" },
              { name: "None", value: "none" }
            ))
            .addIntegerOption((o) => o.setName("timeout").setDescription("Timeout length in minutes when action is timeout (max 40320)").setMinValue(1).setMaxValue(40320))
            .addChannelOption((o) => o.setName("channel").setDescription("Channel to post moderation actions to"))
            .addBooleanOption((o) => o.setName("dm").setDescription("DM members about moderation actions"))
        )
        .addSubcommand((s) => s.setName("status").setDescription("Show warn & moderation settings"))
    ),
    async execute(interaction) {
      const gid = interaction.guildId!;
      const sub = interaction.options.getSubcommand();

      if (sub === "set") {
        const limit = interaction.options.getInteger("limit");
        const action = interaction.options.getString("action") as "timeout" | "kick" | "ban" | "none" | null;
        const timeout = interaction.options.getInteger("timeout");
        const channel = interaction.options.getChannel("channel");
        const dm = interaction.options.getBoolean("dm");

        const patch: Record<string, unknown> = {};
        if (limit != null) patch.warnLimit = limit;
        if (action != null) patch.warnAction = action;
        if (timeout != null) patch.warnTimeoutMins = timeout;
        if (channel) patch.modLogChannel = channel.id;
        if (dm != null) patch.modDmUser = dm;

        if (Object.keys(patch).length === 0) {
          await interaction.reply({ content: "Pick at least one setting to change, or use /warnconfig status.", ephemeral: true });
          return;
        }
        await updateSettings(gid, patch);
        await interaction.reply({ content: "Warn/moderation settings saved.", ephemeral: true });
        return;
      }

      const s = await getSettings(gid);
      const lines = [
        `Warn limit: **${s?.warnLimit ?? 0}** (0 = disabled)`,
        `Auto action: **${s?.warnAction ?? "timeout"}**`,
        `Timeout length: **${s?.warnTimeoutMins ?? 10} min**`,
        `Mod log channel: ${s?.modLogChannel ? `<#${s.modLogChannel}>` : "**not set**"}`,
        `DM members: **${s?.modDmUser ? "yes" : "no"}**`,
      ];
      await interaction.reply({ content: `**Warn config**\n${lines.join("\n")}`, ephemeral: true });
    },
  },
];