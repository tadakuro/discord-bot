import { type VoiceState, ChannelType } from "discord.js";
import { getSettings } from "./store.js";

const tracked = new Map<string, { ownerId: string }>();

export async function handleVoiceState(oldState: VoiceState, newState: VoiceState) {
  try {
    if (!newState.guild?.id) return;
    const guildId = newState.guild.id;
    const settings = await getSettings(guildId);
    if (!settings?.tempvoiceLobby || !settings?.tempvoiceCategory) return;

    const joined = newState.channelId && newState.channelId !== oldState.channelId ? newState.channel : null;
    if (joined && joined.id === settings.tempvoiceLobby) {
      const member = newState.member;
      if (!member) return;
      const dup = [...tracked.entries()].find(([, t]) => t.ownerId === member.id && newState.channelId === settings.tempvoiceLobby);
      if (dup) {
        const existing = newState.guild.channels.cache.get(dup[0]);
        if (existing && existing.type === ChannelType.GuildVoice) {
          await newState.setChannel(existing.id).catch(() => {});
          return;
        }
      }
      const template = (settings.tempvoiceName ?? "{username}'s channel").replace("{username}", member.displayName || member.user.username).replace("{server}", newState.guild.name);
      const created = await newState.guild.channels.create({
        name: template.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: settings.tempvoiceCategory,
      }).catch(() => null);
      if (!created) return;
      tracked.set(created.id, { ownerId: member.id });
      await newState.setChannel(created).catch(() => {});
      return;
    }

    const left = oldState.channelId && newState.channelId !== oldState.channelId ? oldState.channel : null;
    if (left && tracked.has(left.id) && left.members.size === 0) {
      await left.delete().catch(() => {});
      tracked.delete(left.id);
    }
  } catch (err) {
    console.error("Tempvoice failed:", err);
  }
}