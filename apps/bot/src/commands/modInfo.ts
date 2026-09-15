import {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type Role,
  type GuildChannel,
} from "discord.js";
import { getDb } from "../lib/store.js";
import { notes } from "@dcbot/db";
import { eq, and } from "drizzle-orm";
import { uid } from "../lib/uid.js";
import { C, makeEmbed, okReply, errReply, infoReply } from "../lib/embeds.js";
import type { BotCommand } from "./index.js";

type AnyBuilder = SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
const mod = (b: AnyBuilder) => (b as SlashCommandBuilder).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const modInfoCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("roleinfo")
      .setDescription("Show information about a role")
      .addRoleOption((o) => o.setName("role").setDescription("Role to inspect").setRequired(true)),
    async execute(interaction) {
      const role = interaction.options.getRole("role", true) as Role;
      const members = await interaction.guild!.members.fetch().then((m) => m.filter((x) => x.roles.cache.has(role.id)).size).catch(() => 0);
      const perms = role.permissions.toArray();
      const fields: [string, string, boolean?][] = [
        ["ID", role.id, true],
        ["Color", role.hexColor, true],
        ["Position", String(role.position), true],
        ["Created", role.createdAt ? `<t:${Math.floor(role.createdAt.getTime() / 1000)}:R>` : "-"],
        ["Mentions", role.mentionable ? "yes" : "no", true],
        ["Hoist", role.hoist ? "yes" : "no", true],
        ["Members", String(members)],
        ["Key permissions", perms.slice(0, 8).join(", ") || "none"],
      ];
      await interaction.reply({ embeds: [makeEmbed(role.hexColor !== "#000000" ? parseInt(role.hexColor.slice(1), 16) : C.info, `Role: @${role.name}`).addFields(fields.map(([n, v, i]) => ({ name: n, value: v, inline: i ?? false })))] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("channelinfo")
      .setDescription("Show information about a channel")
      .addChannelOption((o) => o.setName("channel").setDescription("Channel to inspect").setRequired(true)),
    async execute(interaction) {
      const channel = interaction.options.getChannel("channel", true) as GuildChannel & { topic?: string };
      const fields: [string, string, boolean?][] = [
        ["ID", channel.id, true],
        ["Type", channel.type === ChannelType.GuildText ? "Text" : channel.type === ChannelType.GuildVoice ? "Voice" : channel.type === ChannelType.GuildAnnouncement ? "Announcement" : channel.type === ChannelType.GuildCategory ? "Category" : "Other", true],
        ["Position", String(channel.position), true],
        ["Created", channel.createdAt ? `<t:${Math.floor(channel.createdAt.getTime() / 1000)}:R>` : "-"],
        ["Topic", channel.topic ?? "none"],
      ];
      await interaction.reply({ embeds: [makeEmbed(C.utility, `Channel: #${channel.name}`).addFields(fields.map(([n, v, i]) => ({ name: n, value: v, inline: i ?? false })))] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("emojiinfo")
      .setDescription("Show information about an emoji")
      .addStringOption((o) => o.setName("emoji").setDescription("Emoji to inspect").setRequired(true)),
    async execute(interaction) {
      const raw = interaction.options.getString("emoji", true);
      const id = raw.match(/(\d{17,20})/)?.[1];
      if (!id) {
        await infoReply(interaction, "Unicode emoji", `\`${raw}\` is a default emoji — no custom info.`);
        return;
      }
      const emoji = await interaction.guild!.emojis.fetch(id).catch(() => null);
      if (!emoji) {
        await errReply(interaction, "Emoji not found", "That emoji is not in this server.");
        return;
      }
      await interaction.reply({
        embeds: [makeEmbed(C.utility, `Emoji: :${emoji.name}:`)
          .setThumbnail(emoji.imageURL({ size: 256 }))
          .addFields(
            { name: "ID", value: emoji.id, inline: true },
            { name: "Animated", value: emoji.animated ? "yes" : "no", inline: true },
            { name: "Created", value: emoji.createdAt ? `<t:${Math.floor(emoji.createdAt.getTime() / 1000)}:R>` : "-" },
            { name: "Raw", value: `<:${emoji.name}:${emoji.id}>` }
          )],
      });
    },
  },

  {
    data: mod(
      new SlashCommandBuilder()
        .setName("inrole")
        .setDescription("List members with a role")
        .addRoleOption((o) => o.setName("role").setDescription("Role to check").setRequired(true))
    ),
    async execute(interaction) {
      const role = interaction.options.getRole("role", true) as Role;
      const members = [...(await interaction.guild!.members.fetch()).values()]
        .filter((m) => m.roles.cache.has(role.id))
        .sort((a, b) => (a.displayName < b.displayName ? -1 : 1));
      if (members.length === 0) {
        await infoReply(interaction, "No members", `Nobody has @${role.name}.`);
        return;
      }
      const list = members.slice(0, 30).map((m) => m.user.displayName).join(", ");
      await okReply(interaction, `@${role.name} — ${members.length}`, list + (members.length > 30 ? `\n…and ${members.length - 30} more` : ""));
    },
  },

  {
    data: mod(
      new SlashCommandBuilder()
        .setName("dehoist")
        .setDescription("Fix nicknames that start with special characters (sorts below A-Z) · reversible")
        .addBooleanOption((o) => o.setName("undo").setDescription("Remove the marker again").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Only rename members with this role"))
        .addBooleanOption((o) => o.setName("dryrun").setDescription("Just count, don't rename"))
    ),
    async execute(interaction) {
      const undo = interaction.options.getBoolean("undo", true);
      const dryRun = interaction.options.getBoolean("dryrun") ?? false;
      const role: Role | null = interaction.options.getRole("role") as Role | null;
      const allowed = /^[a-zA-Z0-9]/;
      const MARKER = "[dm]";
      const members = [...(await interaction.guild!.members.fetch()).values()].filter(
        (m) => (!role || m.roles.cache.has(role.id)) && !m.user.bot
      );
      const targets = members.filter((m) => {
        const nick = m.displayName;
        return undo ? nick.startsWith(MARKER) : !allowed.test(nick);
      });
      if (targets.length === 0) {
        await okReply(interaction, "Nothing to do", undo ? "No hoist-marked nicknames found." : "No hoisted nicknames found.");
        return;
      }
      if (dryRun) {
        await okReply(interaction, `Dehoist dry run`, `${targets.length} member(s) affected. Run again without dry run to apply.`);
        return;
      }
      let done = 0;
      for (const m of targets) {
        const next = undo ? m.displayName.slice(MARKER.length) : `${MARKER}${m.displayName}`;
        const okName = await m.setNickname(next).then(() => true).catch(() => false);
        if (okName) done++;
      }
      await okReply(interaction, "Dehoist complete", `${done}/${targets.length} nicknames updated.`);
    },
  },

  {
    data: mod(
      new SlashCommandBuilder()
        .setName("note")
        .setDescription("Take private moderation notes on a member")
        .addSubcommand((s) => s.setName("add").setDescription("Add a note").addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true)).addStringOption((o) => o.setName("note").setDescription("Note text").setRequired(true)))
        .addSubcommand((s) => s.setName("list").setDescription("List notes for a member").addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true)))
        .addSubcommand((s) => s.setName("clear").setDescription("Clear notes for a member").addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true)))
    ),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const user = interaction.options.getUser("user", true);
      const db = getDb();
      const gid = interaction.guildId!;
      if (sub === "add") {
        const content = interaction.options.getString("note", true);
        await db.insert(notes).values({ id: uid("note_"), guildId: gid, userId: user.id, authorId: interaction.user.id, content });
        await okReply(interaction, "Note added", `Logged a note for <@${user.id}> (private to mods).`);
        return;
      }
      if (sub === "clear") {
        await db.delete(notes).where(and(eq(notes.guildId, gid), eq(notes.userId, user.id)));
        await okReply(interaction, "Notes cleared", `Cleared all notes for <@${user.id}>.`);
        return;
      }
      const list = await db.select().from(notes).where(and(eq(notes.guildId, gid), eq(notes.userId, user.id)));
      if (list.length === 0) {
        await infoReply(interaction, "No notes", `<@${user.id}> has no notes.`);
        return;
      }
      const fields = list.slice(0, 10).map((n) => [`${n.createdAt.toISOString().slice(0, 10)} — by <@${n.authorId}>`, n.content] as [string, string]);
      await interaction.reply({
        embeds: [makeEmbed(C.mod, `Notes for ${user.tag} — ${list.length}`).addFields(fields.map(([n, v]) => ({ name: n, value: v })))],
        ephemeral: true,
      });
    },
  },
];