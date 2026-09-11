import { sendLog } from "../lib/logging.js";
import { EmbedBuilder, type Client, type GuildMember, type PartialGuildMember } from "discord.js";

export async function handleMemberUpdate(client: Client, oldMember: GuildMember | PartialGuildMember, newMember: GuildMember | PartialGuildMember) {
  if (!newMember.guild) return;
  if (newMember.user?.bot) return;
  if (newMember.partial || oldMember.partial) return;

  const changedRoles: string[] = [];
  for (const [id, role] of newMember.roles.cache) {
    if (!oldMember.roles.cache.has(id)) changedRoles.push(`+  <@&${id}>`);
  }
  for (const [id, role] of oldMember.roles.cache) {
    if (!newMember.roles.cache.has(id)) changedRoles.push(`-  <@&${id}>`);
  }

  const oldNick = oldMember.nickname;
  const newNick = newMember.nickname;
  const parts: string[] = [];
  if (oldNick !== newNick) {
    parts.push(`**Nickname:** ${oldNick ?? "none"} → ${newNick ?? "none"}`);
  }
  if (changedRoles.length > 0) {
    parts.push(`**Roles:**\n${changedRoles.join("\n")}`);
  }
  if (parts.length === 0) return;

  const embed = new EmbedBuilder()
    .setAuthor({ name: "Member updated", iconURL: newMember.user.displayAvatarURL({ size: 128 }) })
    .setDescription(`**User:** <@${newMember.id}> (${newMember.user.tag}) in <#${newMember.guild.id}>\n\n${parts.join("\n\n")}`);
  await sendLog(client, newMember.guild.id, "memberUpdate", embed);
}