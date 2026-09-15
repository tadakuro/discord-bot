import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";

export const C = {
  mod: 0xff5b5b,
  leveling: 0x5865f2,
  config: 0x57f287,
  automod: 0xf8b648,
  ai: 0x9146ff,
  utility: 0x5b9cf8,
  welcome: 0x57f287,
  error: 0xed4245,
  success: 0x57f287,
  info: 0x5865f2,
} as const;

export type EmbedField = [name: string, value: string, inline?: boolean];

export const FOOTER = "Astalon";

export function makeEmbed(color: number, title: string, desc = ""): EmbedBuilder {
  const e = new EmbedBuilder().setColor(color);
  if (title) e.setTitle(title);
  if (desc) e.setDescription(desc);
  return e;
}

export function modCard(title: string, desc = "", fields: EmbedField[] = []) {
  return cardWithFields(C.mod, title, desc, fields);
}

function cardWithFields(color: number, title: string, desc: string, fields: EmbedField[]) {
  const e = makeEmbed(color, title, desc);
  if (fields.length) e.addFields(fields.map(([name, value, inline]) => ({ name, value, inline: inline ?? false })));
  return e;
}

type ReplyOpts = {
  ephemeral?: boolean;
  fields?: EmbedField[];
  footer?: string;
  thumbnail?: string;
  image?: string;
  followUp?: boolean;
};

export function embedReply(
  interaction: ChatInputCommandInteraction,
  color: number,
  title: string,
  desc = "",
  opts: ReplyOpts = {}
) {
  const e = makeEmbed(color, title, desc);
  if (opts.fields) e.addFields(opts.fields.map(([name, value, inline]) => ({ name, value, inline: inline ?? false })));
  if (opts.thumbnail) e.setThumbnail(opts.thumbnail);
  if (opts.image) e.setImage(opts.image);
  if (opts.footer) e.setFooter({ text: opts.footer });
  const payload = { embeds: [e], ephemeral: opts.ephemeral ?? true };
  return opts.followUp ? interaction.followUp(payload) : interaction.reply(payload);
}

export function okReply(interaction: ChatInputCommandInteraction, title: string, desc = "", opts: ReplyOpts = {}) {
  return embedReply(interaction, C.success, title, desc, opts);
}

export function errReply(interaction: ChatInputCommandInteraction, title: string, desc = "", opts: ReplyOpts = {}) {
  return embedReply(interaction, C.error, title, desc, opts);
}

export function infoReply(interaction: ChatInputCommandInteraction, title: string, desc = "", opts: ReplyOpts = {}) {
  return embedReply(interaction, C.info, title, desc, opts);
}

export function statusDesc(lines: string[]): string {
  return lines.join("\n");
}