import { sendLog } from "../lib/logging.js";
import { EmbedBuilder, type Client, type Message, type PartialMessage } from "discord.js";

export async function handleMessageDelete(client: Client, message: Message | PartialMessage) {
  if (message.author?.bot) return;
  if (!message.guildId) return;
  if (!message.partial && message.content.length === 0 && message.attachments.size === 0) return;

  const embed = new EmbedBuilder()
    .setAuthor({ name: "Message deleted", iconURL: message.author?.displayAvatarURL({ size: 128 }) })
    .setDescription(
      `**User:** ${message.author?.tag}\n**Channel:** <#${message.channelId}>` +
        (message.content ? `\n**Content:**\n${message.content.slice(0, 1900)}` : "") +
        (message.attachments.size > 0 ? `\n**Attachments:** ${message.attachments.map((a) => `[${a.name}](${a.url})`).join(", ")}` : "")
    );
  await sendLog(client, message.guildId, "messageDelete", embed);
}

export async function handleMessageEdit(
  client: Client,
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
) {
  if (newMessage.author?.bot) return;
  if (!newMessage.guildId) return;
  if (oldMessage.content === newMessage.content) return;

  const embed = new EmbedBuilder()
    .setAuthor({ name: "Message edited", iconURL: newMessage.author?.displayAvatarURL({ size: 128 }) })
    .setDescription(
      `**User:** ${newMessage.author?.tag}\n**Channel:** <#${newMessage.channelId}>\n` +
        (oldMessage.content ? `**Before:**\n${oldMessage.content.slice(0, 950)}\n\n` : "") +
        `**After:**\n${(newMessage.content ?? "").slice(0, 950)}\n\n` +
        `[Jump to message](https://discord.com/channels/${newMessage.guildId}/${newMessage.channelId}/${newMessage.id})`
    );
  await sendLog(client, newMessage.guildId, "messageEdit", embed);
}