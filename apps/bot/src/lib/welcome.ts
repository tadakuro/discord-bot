import { EmbedBuilder, type GuildMember } from "discord.js";

export const DEFAULT_WELCOME =
  "Welcome to **{server}**, {user}! Please check the rules and say hi — we're glad to have you here.";
export const DEFAULT_GOODBYE =
  "Goodbye {user}! Thanks for being part of **{server}** — hope to see you again soon.";

export function template(message: string, member: GuildMember): string {
  return message
    .replace("{user}", `<@${member.id}>`)
    .replace("{username}", member.user.username)
    .replace("{server}", member.guild.name)
    .replace("{memberCount}", String(member.guild.memberCount));
}

export function buildWelcomeEmbed(text: string, member: GuildMember): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Welcome!")
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `Member #${member.guild.memberCount}` });
}

export function buildGoodbyeEmbed(text: string, member: GuildMember): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Goodbye!")
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));
}