import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getDb } from "../lib/store.js";
import { xpProfiles, levelRoles, levelFromXp, xpRequiredForLevel } from "@dcbot/db";
import { and, eq, desc, asc } from "drizzle-orm";
import { uid } from "../lib/uid.js";
import type { BotCommand } from "./index.js";

async function getProfile(guildId: string, userId: string) {
  const db = getDb();
  const existing = await db.query.xpProfiles.findFirst({
    where: and(eq(xpProfiles.guildId, guildId), eq(xpProfiles.userId, userId)),
  });
  if (!existing) {
    const inserted = { guildId, userId, xp: 0 };
    await db.insert(xpProfiles).values(inserted);
    return inserted;
  }
  return existing;
}

function progressBar(current: number, total: number, size = 12) {
  const filled = Math.round((current / total) * size);
  return "█".repeat(filled) + "░".repeat(Math.max(size - filled, 0));
}

export const levelingCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("rank")
      .setDescription("Check your XP and level")
      .addUserOption((o) => o.setName("user").setDescription("Member to check (defaults to you)")),
    async execute(interaction) {
      const targetUser = interaction.options.getUser("user") ?? interaction.user;
      const profile = await getProfile(interaction.guildId!, targetUser.id);
      const level = levelFromXp(profile.xp);
      const current = profile.xp - (level === 1 ? 0 : xpRequiredForLevel(level - 1));
      const needed = xpRequiredForLevel(level);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Rank — ${targetUser.tag}`)
        .setDescription(`**Level ${level}**\n${progressBar(current, needed)}\n\`${current}/${needed} XP\``);
      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("givexp")
      .setDescription("Add or remove XP for a member")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("XP to add (negative to remove)").setRequired(true)),
    async execute(interaction) {
      const user = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      const db = getDb();
      const gid = interaction.guildId!;

      const existing = (await db.query.xpProfiles.findFirst({
        where: and(eq(xpProfiles.guildId, gid), eq(xpProfiles.userId, user.id)),
      })) ?? { guildId: gid, userId: user.id, xp: 0 };

      const newXp = Math.max(0, existing.xp + amount);
      await db
        .insert(xpProfiles)
        .values({ guildId: gid, userId: user.id, xp: newXp })
        .onConflictDoUpdate({
          target: [xpProfiles.guildId, xpProfiles.userId],
          set: { xp: newXp },
        });

      await interaction.reply({
        content: `Adjusted XP for <@${user.id}> by **${amount > 0 ? `+${amount}` : amount}** → now \`${newXp} XP\` (level **${levelFromXp(newXp)}**).`,
        ephemeral: true,
      });
    },
  },

  {
    data: new SlashCommandBuilder().setName("leaderboard").setDescription("Top 10 members by XP"),
    async execute(interaction) {
      const db = getDb();
      const top = await db
        .select()
        .from(xpProfiles)
        .where(eq(xpProfiles.guildId, interaction.guildId!))
        .orderBy(desc(xpProfiles.xp))
        .limit(10);
      if (top.length === 0) {
        await interaction.reply({ content: "No XP data yet.", ephemeral: true });
        return;
      }
      const lines = await Promise.all(
        top.map(async (p, i) => {
          let name: string;
          const member = await interaction.guild!.members.fetch(p.userId).catch(() => null);
          name = member ? member.user.username : `<@${p.userId}>`;
          return `\`${i + 1}.\` **${name}** — level ${levelFromXp(p.xp)} (\`${p.xp} XP\`)`;
        })
      );
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Leaderboard")
        .setDescription(lines.join("\n"));
      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("levelroles")
      .setDescription("Manage level-up role rewards")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Assign a role when a member reaches a level")
          .addIntegerOption((o) => o.setName("level").setDescription("Level reached").setRequired(true))
          .addRoleOption((o) => o.setName("role").setDescription("Role to grant").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription("Remove a level role")
          .addIntegerOption((o) => o.setName("level").setDescription("Level").setRequired(true))
      )
      .addSubcommand((s) => s.setName("list").setDescription("List configured level roles")),
    async execute(interaction) {
      const db = getDb();
      const gid = interaction.guildId!;
      const sub = interaction.options.getSubcommand();
      if (sub === "add") {
        const level = interaction.options.getInteger("level", true);
        const role = interaction.options.getRole("role", true);
        if (role.id === interaction.guild!.id) {
          await interaction.reply({ content: "@everyone cannot be used as a level role.", ephemeral: true });
          return;
        }
        await db
          .insert(levelRoles)
          .values({ id: uid("lvl_"), guildId: gid, level, roleId: role.id })
          .onConflictDoNothing();
        await interaction.reply({ content: `Role <@&${role.id}> will be granted at level **${level}**.`, ephemeral: true });
      } else if (sub === "remove") {
        const level = interaction.options.getInteger("level", true);
        const found = await db.select().from(levelRoles).where(and(eq(levelRoles.guildId, gid), eq(levelRoles.level, level)));
        if (found.length === 0) {
          await interaction.reply({ content: `No role configured for level ${level}.`, ephemeral: true });
          return;
        }
        for (const r of found) await db.delete(levelRoles).where(eq(levelRoles.id, r.id));
        await interaction.reply({ content: `Removed level role at level **${level}**.`, ephemeral: true });
      } else {
        const list = await db.select().from(levelRoles).where(eq(levelRoles.guildId, gid)).orderBy(asc(levelRoles.level));
        if (list.length === 0) {
          await interaction.reply({ content: "No level roles configured.", ephemeral: true });
          return;
        }
        const desc = `\`Level ${list.map((r) => r.level).join("`, `Level ")}\``;
        await interaction.reply({ content: `**Level roles:**\n${desc}`, ephemeral: true });
      }
    },
  },
];