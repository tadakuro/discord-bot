import { getDb } from "../lib/store.js";
import { reactionRoles } from "@dcbot/db";
import { and, eq } from "drizzle-orm";
import type { MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";

export async function handleReaction(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, action: "add" | "remove") {
  if (user.bot || !user.id) return;
  if (!reaction.message.guildId) return;

  if (reaction.partial) await reaction.fetch().catch(() => {});
  const message = reaction.message;
  if (message.partial) await message.fetch().catch(() => {});
  if (!message.guildId) return;

  const db = getDb();
  const mappings = await db
    .select()
    .from(reactionRoles)
    .where(
      and(
        eq(reactionRoles.guildId, message.guildId),
        eq(reactionRoles.messageId, message.id)
      )
    );

  const emojiKey = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
  const mapping = mappings.find((m) => m.emoji === reaction.emoji.name || m.emoji === emojiKey);
  if (!mapping) return;

  if (!message.guild) return;
  const member = message.guild.members.cache.get(user.id) ?? (await message.guild.members.fetch(user.id).catch(() => null));
  if (!member) return;

  try {
    if (action === "add" && !member.roles.cache.has(mapping.roleId)) {
      await member.roles.add(mapping.roleId);
    } else if (action === "remove" && member.roles.cache.has(mapping.roleId)) {
      await member.roles.remove(mapping.roleId);
    }
  } catch (err) {
    console.error("Reaction role failed:", err);
  }
}