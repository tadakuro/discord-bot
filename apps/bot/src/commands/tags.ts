import { SlashCommandBuilder, type Message, PermissionFlagsBits } from "discord.js";
import { getDb } from "../lib/store.js";
import { tags } from "@dcbot/db";
import { eq, and } from "drizzle-orm";
import { uid } from "../lib/uid.js";
import { C, okReply, errReply, infoReply } from "../lib/embeds.js";
import type { BotCommand } from "./index.js";

async function fetchTag(guildId: string, name: string) {
  const db = getDb();
  const direct = await db.select().from(tags).where(and(eq(tags.guildId, guildId), eq(tags.name, name)));
  if (direct.length > 0) return direct[0];
  const alias = await db.select().from(tags).where(and(eq(tags.guildId, guildId), eq(tags.aliasedTo, name)));
  if (alias.length > 0) {
    const target = await db.select().from(tags).where(and(eq(tags.guildId, guildId), eq(tags.name, alias[0].aliasedTo!)));
    if (target.length > 0) return target[0];
  }
  return null;
}

export async function resolveTag(message: Message, name: string, args: string[]): Promise<boolean> {
  const tag = await fetchTag(message.guildId!, name);
  if (!tag) return false;
  const content = tag.content.replaceAll("{args}", args.join(" ")).replaceAll("{author}", `<@${message.author.id}>`);
  await (message.channel as unknown as { send: (p: { content: string }) => Promise<unknown> }).send({ content }).catch(() => {});
  return true;
}

export const tagCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("tags")
      .setDescription("Custom prefix commands for your server")
      .addSubcommand((s) => s.setName("add").setDescription("Create a tag").addStringOption((o) => o.setName("name").setDescription("Tag name (no spaces)").setRequired(true)).addStringOption((o) => o.setName("content").setDescription("Content — supports {args} and {author}").setRequired(true)))
      .addSubcommand((s) => s.setName("edit").setDescription("Edit a tag").addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true)).addStringOption((o) => o.setName("content").setDescription("New content").setRequired(true)))
      .addSubcommand((s) => s.setName("delete").setDescription("Delete a tag").addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true)))
      .addSubcommand((s) => s.setName("alias").setDescription("Make a shortcut for another tag").addStringOption((o) => o.setName("name").setDescription("New alias name").setRequired(true)).addStringOption((o) => o.setName("target").setDescription("Existing tag to point to").setRequired(true)))
      .addSubcommand((s) => s.setName("get").setDescription("Show a tag").addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true)))
      .addSubcommand((s) => s.setName("list").setDescription("List all tags")),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const db = getDb();
      const gid = interaction.guildId!;
      const name = interaction.options.getString("name")?.toLowerCase();
      const manage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);

      if (sub === "add") {
        if (!manage) return void (await errReply(interaction, "Permission needed", "You need Manage Messages to create tags."));
        if (!name || !/^[\w-]{1,32}$/.test(name)) {
          await errReply(interaction, "Bad name", "Tag names are 1-32 chars, letters/numbers/_/-.");
          return;
        }
        if (await fetchTag(gid, name)) {
          await errReply(interaction, "Already exists", `Tag \`${name}\` exists — use /tags edit.`);
          return;
        }
        await db.insert(tags).values({ id: uid("tag_"), guildId: gid, name, content: interaction.options.getString("content", true), ownerId: interaction.user.id });
        await okReply(interaction, "Tag created", `Tag \`${name}\` created. Use it as \`!${name}\`.`);
        return;
      }
      if (sub === "edit") {
        if (!manage) return void (await errReply(interaction, "Permission needed", "You need Manage Messages to edit tags."));
        const existing = name ? await fetchTag(gid, name) : null;
        if (!existing) {
          await errReply(interaction, "Not found", "That tag doesn't exist.");
          return;
        }
        await db.update(tags).set({ content: interaction.options.getString("content", true) }).where(eq(tags.id, existing.id));
        await okReply(interaction, "Tag updated", `Updated \`${name}\`.`);
        return;
      }
      if (sub === "delete") {
        if (!manage) return void (await errReply(interaction, "Permission needed", "You need Manage Messages to delete tags."));
        const existing = name ? await fetchTag(gid, name) : null;
        if (!existing) {
          await errReply(interaction, "Not found", "That tag doesn't exist.");
          return;
        }
        await db.delete(tags).where(eq(tags.id, existing.id));
        await okReply(interaction, "Tag deleted", `Deleted \`${name}\`.`);
        return;
      }
      if (sub === "alias") {
        if (!manage) return void (await errReply(interaction, "Permission needed", "You need Manage Messages to make aliases."));
        if (!name || !/^[\w-]{1,32}$/.test(name)) {
          await errReply(interaction, "Bad name", "Alias names are 1-32 chars, letters/numbers/_/-.");
          return;
        }
        const target = interaction.options.getString("target", true).toLowerCase();
        const real = await fetchTag(gid, target);
        if (!real) {
          await errReply(interaction, "Not found", "The target tag doesn't exist.");
          return;
        }
        if (await fetchTag(gid, name)) {
          await errReply(interaction, "Already exists", "That name is already taken.");
          return;
        }
        await db.insert(tags).values({ id: uid("tag_"), guildId: gid, name, content: "", ownerId: interaction.user.id, aliasedTo: real.name });
        await okReply(interaction, "Alias created", `\`${name}\` now points at \`${real.name}\`.`);
        return;
      }
      if (sub === "get") {
        if (!name) return;
        const tag = await fetchTag(gid, name);
        if (!tag) {
          await errReply(interaction, "Not found", "That tag doesn't exist.");
          return;
        }
        await interaction.reply({ content: tag.content, ephemeral: false });
        return;
      }
      const list = await db.select().from(tags).where(eq(tags.guildId, gid));
      if (list.length === 0) {
        await infoReply(interaction, "No tags", "No tags yet. Create one with `/tags add`.");
        return;
      }
      await okReply(interaction, `Tags (${list.length})`, list.slice(0, 40).map((t) => `\`${t.name}\``).join(" ") || "none");
    },
  },
];