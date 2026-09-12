import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getDb } from "../lib/store.js";
import { reactionRoles } from "@dcbot/db";
import { eq } from "drizzle-orm";
import { uid } from "../lib/uid.js";
import { C, makeEmbed, okReply, errReply, infoReply } from "../lib/embeds.js";
import type { BotCommand } from "./index.js";

export const reactionRoleCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("reactionrole")
      .setDescription("Set up or manage reaction roles")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand((s) =>
        s
          .setName("setup")
          .setDescription("Post a reaction-role panel in a channel")
          .addChannelOption((o) => o.setName("channel").setDescription("Channel to post the panel in").setRequired(true))
          .addStringOption((o) => o.setName("title").setDescription("Panel title"))
          .addStringOption((o) => o.setName("description").setDescription("Panel description"))
      )
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Add emoji -> role mapping")
          .addChannelOption((o) => o.setName("channel").setDescription("Channel with the panel message").setRequired(true))
          .addStringOption((o) => o.setName("message_id").setDescription("Message ID of the panel").setRequired(true))
          .addStringOption((o) => o.setName("emoji").setDescription("Emoji to react with").setRequired(true))
          .addRoleOption((o) => o.setName("role").setDescription("Role to assign").setRequired(true))
      )
      .addSubcommand((s) => s.setName("list").setDescription("List configured reaction roles"))
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription("Remove a reaction-role mapping")
          .addStringOption((o) => o.setName("id").setDescription("Reaction role ID").setRequired(true))
      ),
    async execute(interaction) {
      const db = getDb();
      const gid = interaction.guildId!;
      const sub = interaction.options.getSubcommand();

      if (sub === "setup") {
        const channel = interaction.options.getChannel("channel", true);
        if (!("send" in channel)) {
          await errReply(interaction, "Invalid channel", "Please pick a text channel.");
          return;
        }
        const title = interaction.options.getString("title") ?? "Reaction Roles";
        const description = interaction.options.getString("description") ?? "React below to get roles.";
        const panel = await channel.send({
          embeds: [new EmbedBuilder().setColor(C.utility).setTitle(title).setDescription(description)],
        });
        await okReply(interaction, "Panel posted", `Panel posted in ${channel}. Use **/reactionrole add** to add emoji -> role mappings for message \`${panel.id}\`.`);
      } else if (sub === "add") {
        const channel = interaction.options.getChannel("channel", true);
        const messageId = interaction.options.getString("message_id", true);
        const emoji = interaction.options.getString("emoji", true);
        const role = interaction.options.getRole("role", true);
        if (role.id === interaction.guild!.id) {
          await errReply(interaction, "Invalid role", "@everyone cannot be used.");
          return;
        }
        if (!("messages" in channel)) {
          await errReply(interaction, "Invalid channel", "Invalid channel.");
          return;
        }
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) {
          await errReply(interaction, "Message not found", "Could not find that message. Make sure the channel is correct and I have view access.");
          return;
        }
        await message.react(emoji);
        await db.insert(reactionRoles).values({
          id: uid("rr_"),
          guildId: gid,
          messageId,
          channelId: channel.id,
          emoji,
          roleId: role.id,
        });
        await okReply(interaction, "Reaction role added", `Reacting with ${emoji} on that message will now grant <@&${role.id}>.`);
      } else if (sub === "list") {
        const list = await db.select().from(reactionRoles).where(eq(reactionRoles.guildId, gid));
        if (list.length === 0) {
          await infoReply(interaction, "No reaction roles", "No reaction roles configured.");
          return;
        }
        const lines = list.map((r) => `\`${r.id}\` — ${r.emoji} → <@&${r.roleId}> (message \`${r.messageId}\`)`);
        await infoReply(interaction, "Reaction roles", lines.join("\n"));
      } else if (sub === "remove") {
        const id = interaction.options.getString("id", true);
        const found = await db.select().from(reactionRoles).where(eq(reactionRoles.id, id));
        if (found.length === 0 || found[0].guildId !== gid) {
          await errReply(interaction, "Not found", "Reaction role not found.");
          return;
        }
        await db.delete(reactionRoles).where(eq(reactionRoles.id, id));
        await okReply(interaction, "Reaction role removed", `Removed reaction role \`${id}\`.`);
      }
    },
  },
];