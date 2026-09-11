import { getDb } from "../lib/store.js";
import { guildSettings, autoRoles } from "@dcbot/db";
import { eq } from "drizzle-orm";
import { EmbedBuilder, type Client, type GuildMember, type PartialGuildMember } from "discord.js";
import { sendLog } from "../lib/logging.js";

async function resolveMember(member: GuildMember | PartialGuildMember): Promise<GuildMember | null> {
  return member.partial ? member.fetch().catch(() => null) : member;
}

export function template(message: string, member: GuildMember): string {
  return message
    .replace("{user}", `<@${member.id}>`)
    .replace("{username}", member.user.username)
    .replace("{server}", member.guild.name)
    .replace("{memberCount}", String(member.guild.memberCount));
}

export async function sendWelcomeEmbed(member: GuildMember) {
  const db = getDb();
  const settings = await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, member.guild.id) });
  if (!settings || !settings.welcomeEnabled || !settings.welcomeChannel) return;

  const channel = await member.guild.channels.fetch(settings.welcomeChannel).catch(() => null);
  if (!channel || !("send" in channel)) return;

  const text = template(settings.welcomeMessage ?? "Welcome {user} to {server}!", member);
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Welcome!")
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `Member #${member.guild.memberCount}` });
  await channel.send({ embeds: [embed] }).catch(() => {});
}

export async function sendGoodbyeEmbed(member: GuildMember) {
  const db = getDb();
  const settings = await db.query.guildSettings.findFirst({ where: eq(guildSettings.guildId, member.guild.id) });
  if (!settings || !settings.goodbyeEnabled || !settings.goodbyeChannel) return;

  const channel = await member.guild.channels.fetch(settings.goodbyeChannel).catch(() => null);
  if (!channel || !("send" in channel)) return;

  const text = template(settings.goodbyeMessage ?? "{user} left {server}.", member);
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Goodbye!")
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function applyAutoRoles(member: GuildMember) {
  const db = getDb();
  const roles = await db.select().from(autoRoles).where(eq(autoRoles.guildId, member.guild.id));
  if (roles.length === 0) return;
  await member.roles.add(roles.map((r) => r.roleId)).catch(() => {});
}

export async function handleMemberAdd(member: GuildMember | PartialGuildMember, client: Client) {
  const resolved = await resolveMember(member);
  if (!resolved) return;
  member = resolved;

  await applyAutoRoles(member);
  await sendWelcomeEmbed(member);

  const embed = new EmbedBuilder()
    .setAuthor({ name: `Member ${member.user.username} joined`, iconURL: member.user.displayAvatarURL({ size: 128 }) })
    .setDescription(`<@${member.id}> (${member.user.username})\n**Created account:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>\n**Position:** #${member.guild.memberCount}`);
  await sendLog(client, member.guild.id, "memberJoin", embed);
}

export async function handleMemberLeave(member: GuildMember | PartialGuildMember, client: Client) {
  const resolved = await resolveMember(member);
  if (!resolved) return;
  member = resolved;

  await sendGoodbyeEmbed(member);

  const embed = new EmbedBuilder()
    .setAuthor({ name: `Member ${member.user.username} left`, iconURL: member.user.displayAvatarURL({ size: 128 }) })
    .setDescription(`<@${member.id}> (${member.user.username})\n**Joined:** ${member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "unknown"}`);
  await sendLog(client, member.guild.id, "memberLeave", embed);
}