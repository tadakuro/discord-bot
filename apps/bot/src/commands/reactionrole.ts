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
          await interaction.reply({ content: "Please pick a text channel.", ephemeral: true });
          return;
        }
        const title = interaction.options.getString("title") ?? "Reaction Roles";
        const description = interaction.options.getString("description") ?? "React below to get roles.";
        const panel = await channel.send({
          embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(title).setDescription(description)],
        });
        await interaction.reply({ content: `Panel posted in ${channel}. Use **/reactionrole add** to add emoji -> role mappings for message \`${panel.id}\`.`, ephemeral: true });
      } else if (sub === "add") {
        const channel = interaction.options.getChannel("channel", true);
        const messageId = interaction.options.getString("message_id", true);
        const emoji = interaction.options.getString("emoji", true);
        const role = interaction.options.getRole("role", true);
        if (role.id === interaction.guild!.id) {
          await interaction.reply({ content: "@everyone cannot be used.", ephemeral: true });
          return;
        }
        if (!("messages" in channel)) {
          await interaction.reply({ content: "Invalid channel.", ephemeral: true });
          return;
        }
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) {
          await interaction.reply({ content: "Could not find that message. Make sure the channel is correct and I have view access.", ephemeral: true });
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
        await interaction.reply({ content: `Reacting with ${emoji} on that message will now grant <@&${role.id}>.`, ephemeral: true });
      } else if (sub === "list") {
        const list = await db.select().from(reactionRoles).where(eq(reactionRoles.guildId, gid));
        if (list.length === 0) {
          await interaction.reply({ content: "No reaction roles configured.", ephemeral: true });
          return;
        }
        const lines = list.map((r) => `\`${r.id}\` — ${r.emoji} → <@&${r.roleId}> (message \`${r.messageId}\`)`);
        await interaction.reply({ content: `**Reaction roles:**\n${lines.join("\n")}`, ephemeral: true });
      } else if (sub === "remove") {
        const id = interaction.options.getString("id", true);
        const found = await db.select().from(reactionRoles).where(eq(reactionRoles.id, id));
        if (found.length === 0 || found[0].guildId !== gid) {
          await interaction.reply({ content: "Reaction role not found.", ephemeral: true });
          return;
        }
        await db.delete(reactionRoles).where(eq(reactionRoles.id, id));
        await interaction.reply({ content: `Removed reaction role \`${id}\`.`, ephemeral: true });
      }
    },
  },
];