import {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
} from "discord.js";
import { makeEmbed, okReply, errReply, C } from "../lib/embeds.js";
import type { BotCommand } from "./index.js";

type AnyBuilder = SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
const admin = (b: AnyBuilder) => (b as SlashCommandBuilder).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

async function findEmoji(guild: Guild, target: string) {
  if (!target) return null;
  return (
    guild.emojis.cache.get(target) ??
    [...guild.emojis.cache.values()].find((e) => e.name === target) ??
    (await guild.emojis.fetch(target).catch(() => null))
  );
}

export const modAdminCommands: BotCommand[] = [
  {
    data: admin(
      new SlashCommandBuilder()
        .setName("embed")
        .setDescription("Send a custom embed to a channel")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to send to").setRequired(true))
        .addStringOption((o) => o.setName("title").setDescription("Title"))
        .addStringOption((o) => o.setName("description").setDescription("Body text"))
        .addStringOption((o) => o.setName("color").setDescription("Hex color, e.g. ff0000 or #5865f2"))
        .addStringOption((o) => o.setName("field1").setDescription("Field 1 (name | value)"))
        .addStringOption((o) => o.setName("field2").setDescription("Field 2 (name | value)"))
        .addStringOption((o) => o.setName("field3").setDescription("Field 3 (name | value)"))
        .addStringOption((o) => o.setName("footer").setDescription("Footer text"))
    ),
    async execute(interaction) {
      const channel = interaction.options.getChannel("channel", true);
      if (!("send" in channel)) {
        await errReply(interaction, "Invalid channel", "Pick a text channel.");
        return;
      }
      const colorRaw = interaction.options.getString("color") ?? "";
      const color = /^#?[0-9a-fA-F]{6}$/.test(colorRaw) ? parseInt(colorRaw.replace("#", ""), 16) : undefined;
      const embed = makeEmbed(color ?? C.utility, interaction.options.getString("title") ?? "", interaction.options.getString("description") ?? "");
      const fields: [string, string][] = [];
      for (const raw of [interaction.options.getString("field1"), interaction.options.getString("field2"), interaction.options.getString("field3")]) {
        if (!raw) continue;
        const [name, ...rest] = raw.split("|");
        if (name && rest.length) fields.push([name.trim(), rest.join("|").trim()]);
      }
      if (fields.length) embed.addFields(fields.map(([n, v]) => ({ name: n, value: v })));
      const footer = interaction.options.getString("footer");
      if (footer) embed.setFooter({ text: footer });
      await channel.send({ embeds: [embed] });
      await okReply(interaction, "Embed sent", `Posted in ${channel}.`);
    },
  },

  {
    data: admin(
      new SlashCommandBuilder()
        .setName("say")
        .setDescription("Send a message as the bot")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to send to").setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("Message text").setRequired(true))
    ),
    async execute(interaction) {
      const channel = interaction.options.getChannel("channel", true);
      const text = interaction.options.getString("message", true);
      if (!("send" in channel)) {
        await errReply(interaction, "Invalid channel", "Pick a text channel.");
        return;
      }
      await channel.send({ content: text });
      await okReply(interaction, "Message sent", `Sent as the bot in ${channel}.`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("emoji")
      .setDescription("Manage server emoji")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageEmojisAndStickers)
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Add a custom emoji")
          .addStringOption((o) => o.setName("emoji").setDescription("Emoji code, ID, or image URL"))
          .addStringOption((o) => o.setName("name").setDescription("Name (defaults to the emoji)").setMaxLength(32))
          .addAttachmentOption((o) => o.setName("file").setDescription("Or upload a PNG/GIF here"))
      )
      .addSubcommand((s) =>
        s.setName("rename").setDescription("Rename an emoji")
          .addStringOption((o) => o.setName("emoji").setDescription("The emoji to rename").setRequired(true))
          .addStringOption((o) => o.setName("name").setDescription("New name").setRequired(true).setMaxLength(32))
      )
      .addSubcommand((s) => s.setName("delete").setDescription("Delete an emoji").addStringOption((o) => o.setName("emoji").setDescription("The emoji to delete").setRequired(true)))
      .addSubcommand((s) => s.setName("list").setDescription("List all server emoji")),
    async execute(interaction, client) {
      const sub = interaction.options.getSubcommand();
      const guild = interaction.guild!;
      if (sub === "list") {
        const emojis = [...guild.emojis.cache.values()];
        if (emojis.length === 0) {
          await okReply(interaction, "No emoji", "This server has no custom emoji.");
          return;
        }
        await okReply(interaction, `Server emoji (${emojis.length})`, emojis.slice(0, 40).map((e) => `${e} \`${e.name}\``).join(" "));
        return;
      }
      const emojiArg = interaction.options.getString("emoji", true);
      const idFound = emojiArg.match(/:(\d{17,20})>/)?.[1] ?? emojiArg.match(/^\d{17,20}$/)?.[0] ?? null;
      if (sub === "rename") {
        const name = interaction.options.getString("name", true);
        const emoji = await findEmoji(guild, idFound ?? emojiArg);
        if (!emoji) {
          await errReply(interaction, "Emoji not found", "That emoji is not in this server.");
          return;
        }
        await emoji.edit({ name });
        await okReply(interaction, "Emoji renamed", `${emoji} is now named \`${name}\`.`);
        return;
      }
      if (sub === "delete") {
        const emoji = await findEmoji(guild, idFound ?? emojiArg);
        if (!emoji) {
          await errReply(interaction, "Emoji not found", "That emoji is not in this server.");
          return;
        }
        await emoji.delete();
        await okReply(interaction, "Emoji deleted", `Deleted \`:${emoji.name}:\`.`);
        return;
      }
      const file = interaction.options.getAttachment("file");
      let source: string | null = null;
      if (file) {
        source = file.url;
      } else {
        const id = emojiArg.match(/\d{17,20}/)?.[0];
        if (id) {
          for (const g of client.guilds.cache.values()) {
            const e = g.emojis.cache.get(id) ?? (await g.emojis.fetch(id).catch(() => null));
            if (e) {
              source = e.imageURL({ size: 256 });
              break;
            }
          }
          if (!source) source = id;
        } else {
          const url = emojiArg.match(/https?:\/\/[^\s]+/)?.[0];
          if (url) source = url;
        }
      }
      if (!source) {
        await errReply(interaction, "Emoji not found", "Give an emoji (code, ID or URL) or upload a file.");
        return;
      }
      const fallbackName =
        emojiArg.match(/:(\w{2,32}):/)?.[1] ?? emojiArg.match(/^(\w{2,32})$/)?.[1] ?? file?.name.replace(/\.[a-z]+$/i, "") ?? "emoji";
      const name = interaction.options.getString("name") ?? fallbackName;
      if (!/^\w{2,32}$/.test(name)) {
        await errReply(interaction, "Bad name", "Emoji names are 2-32 letters, digits or underscores.");
        return;
      }
      const created = await guild.emojis.create({ attachment: source, name }).catch(() => null);
      if (!created) {
        await errReply(interaction, "Failed", "Could not create that emoji (size/format/limit).");
        return;
      }
      await okReply(interaction, "Emoji added", `Added ${created}`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("steal")
      .setDescription("Copy emoji from a message into this server")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageEmojisAndStickers)
      .addStringOption((o) => o.setName("message").setDescription("Message link or channelId-messageId").setRequired(true)),
    async execute(interaction) {
      const raw = interaction.options.getString("message", true);
      const parse = raw.match(/channels\/(\d+)\/(\d+)/) ?? raw.match(/^(\d{17,21})-(\d{17,21})$/);
      if (!parse) {
        await errReply(interaction, "Bad link", "Send a message link or channelId-messageId.");
        return;
      }
      const [, channelId, messageId] = parse;
      const channel = await interaction.guild!.channels.fetch(channelId).catch(() => null);
      if (!channel || !("messages" in channel)) {
        await errReply(interaction, "Bad channel", "Could not reach that channel.");
        return;
      }
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        await errReply(interaction, "Bad message", "Could not fetch that message.");
        return;
      }
      const emojis = [...message.content.matchAll(/<a?:(\w{2,32}):(\d{17,20})>/g)].map((m) => ({
        name: m[1],
        id: m[2],
        animated: m[0].startsWith("<a"),
      }));
      if (emojis.length === 0) {
        await errReply(interaction, "No emoji", "That message has no custom emoji.");
        return;
      }
      let added = 0;
      const failures: string[] = [];
      for (const e of emojis.slice(0, 10)) {
        const okEmoji = await interaction.guild!.emojis
          .create({ attachment: `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "png"}`, name: e.name })
          .then(() => true)
          .catch(() => false);
        if (okEmoji) added++;
        else failures.push(e.name);
      }
      await okReply(interaction, "Steal complete", `Added **${added}** emoji${failures.length ? `, failed: ${failures.join(", ")}` : ""}.`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("sticker")
      .setDescription("Manage server stickers")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageEmojisAndStickers)
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Upload a sticker (image attachment)")
          .addAttachmentOption((o) => o.setName("file").setDescription("PNG/APNG image to upload").setRequired(true))
          .addStringOption((o) => o.setName("name").setDescription("Sticker name").setRequired(true))
          .addStringOption((o) => o.setName("tags").setDescription("Search tag"))
          .addStringOption((o) => o.setName("description").setDescription("Description"))
      )
      .addSubcommand((s) => s.setName("list").setDescription("List server stickers"))
      .addSubcommand((s) => s.setName("delete").setDescription("Delete a sticker").addStringOption((o) => o.setName("name").setDescription("Sticker name").setRequired(true))),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const guild = interaction.guild!;
      if (sub === "list") {
        const stickers = [...guild.stickers.cache.values()];
        if (stickers.length === 0) {
          await okReply(interaction, "No stickers", "This server has no stickers.");
          return;
        }
        await okReply(interaction, `Server stickers (${stickers.length})`, stickers.slice(0, 20).map((s) => `\`${s.name}\``).join(", "));
        return;
      }
      if (sub === "delete") {
        const name = interaction.options.getString("name", true);
        const sticker = guild.stickers.cache.find((s) => s.name.toLowerCase() === name.toLowerCase());
        if (!sticker) {
          await errReply(interaction, "Sticker not found", `No sticker named \`${name}\` here.`);
          return;
        }
        await sticker.delete();
        await okReply(interaction, "Sticker deleted", `Deleted \`${sticker.name}\`.`);
        return;
      }
      const file = interaction.options.getAttachment("file", true);
      const buf = Buffer.from(await (await fetch(file.url)).arrayBuffer());
      const created = await guild.stickers
        .create({
          file: { attachment: buf, name: file.name },
          name: interaction.options.getString("name", true),
          description: interaction.options.getString("description") ?? "Made with DCBot",
          tags: interaction.options.getString("tags") ?? interaction.options.getString("name", true),
        })
        .catch(() => null);
      if (!created) {
        await errReply(interaction, "Failed", "Could not upload the sticker (check size and sticker slots).");
        return;
      }
      await okReply(interaction, "Sticker added", `Added \`${created.name}\`.`);
    },
  },
];