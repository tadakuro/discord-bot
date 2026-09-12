import { getDb, getSettings } from "./store.js";
import { warns, type AntiSpamConfig, type guildSettings } from "@dcbot/db";
import { uid } from "./uid.js";
import { activeWarnCount } from "./punish.js";
import { EmbedBuilder, type GuildMember, type Message } from "discord.js";
import { C } from "./embeds.js";

const windowCache = new Map<string, number[]>();
const actionCache = new Map<string, number>();
const MAX_SAMPLES = 500;

function prune(key: string, windowMs: number, now: number): number[] {
  const times = (windowCache.get(key) ?? []).filter((t) => now - t < windowMs);
  windowCache.set(key, times);
  return times;
}

function isExempt(member: GuildMember | null, config: AntiSpamConfig): boolean {
  if (!member || !config.exemptRoles?.length) return false;
  return member.roles.cache.some((r) => config.exemptRoles!.includes(r.id));
}

async function deleteSpam(message: Message) {
  const channel = message.channel;
  if (!("bulkDelete" in channel)) {
    if (message.deletable) await message.delete().catch(() => {});
    return;
  }
  const windowUtc = Date.now() - 60_000;
  const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!fetched) {
    if (message.deletable) await message.delete().catch(() => {});
    return;
  }
  const targets = fetched
    .filter((m) => m.author?.id === message.author.id && m.createdTimestamp > windowUtc)
    .map((m) => m.id);
  if (targets.length === 0) {
    if (message.deletable) await message.delete().catch(() => {});
    return;
  }
  await channel.bulkDelete(targets).catch(() => {});
}

async function dmUser(message: Message, config: AntiSpamConfig, actionName: string, warnCount?: number) {
  const embed = new EmbedBuilder()
    .setColor(C.automod)
    .setTitle("Anti-spam — action taken")
    .setDescription(
      `Your messages in **${message.guild!.name}** were removed for sending too many messages too fast (${config.limit ?? 5} msgs / ${config.windowSecs ?? 5}s).\n**Action:** ${actionName}${warnCount ? `\n**Warning:** ${warnCount}` : ""}`
    );
  await message.author.send({ embeds: [embed] }).catch(() => {});
}

async function postModLog(message: Message, actionName: string, config: AntiSpamConfig) {
  const settings = await getSettings(message.guildId!);
  if (!settings?.modLogChannel) return;
  const channel = await message.guild!.channels.fetch(settings.modLogChannel).catch(() => null);
  if (!channel || !("send" in channel)) return;
  const embed = new EmbedBuilder()
    .setColor(C.automod)
    .setTitle("Anti-spam triggered")
    .setDescription(
      `**User:** <@${message.author.id}> (${message.author.tag})\n**Action:** ${actionName}\n**Threshold:** ${config.limit ?? 5} msgs / ${config.windowSecs ?? 5}s\n**Channel:** <#${message.channelId}>`
    );
  await channel.send({ embeds: [embed] }).catch(() => {});
}

export async function handleAntiSpam(message: Message, settings: typeof guildSettings.$inferSelect): Promise<boolean> {
  const config = settings.antispam as AntiSpamConfig | undefined;
  if (!config?.enabled) return false;
  if (config.limit == null || config.limit <= 0) return false;

  const member = message.member ?? (await message.guild!.members.fetch(message.author.id).catch(() => null));
  if (isExempt(member, config)) return false;

  const limit = config.limit;
  const windowMs = (config.windowSecs ?? 5) * 1000;
  const now = Date.now();
  const key = `${message.guildId}:${message.author.id}`;

  const times = prune(key, windowMs, now);
  times.push(now);
  if (times.length > MAX_SAMPLES) times.splice(0, times.length - MAX_SAMPLES);
  windowCache.set(key, times);

  if (times.length <= limit) return false;

  const lastAction = actionCache.get(key) ?? 0;
  if (now - lastAction < Math.min(windowMs, 30_000)) return false;
  actionCache.set(key, now);

  await deleteSpam(message);

  const action = config.action ?? "warn";
  let actionName = "messages deleted";
  const db = getDb();

  if (action === "warn" || action === "timeout") {
    await db.insert(warns).values({
      id: uid("warn_"),
      guildId: message.guildId!,
      userId: message.author.id,
      moderatorId: message.client.user.id,
      reason: "Anti-spam: message flood",
    });
    const count = await activeWarnCount(message.guildId!, message.author.id);
    if (action === "timeout") {
      const mins = Math.max(1, Math.min(config.timeoutMins ?? 10, 40320));
      await member?.timeout(mins * 60_000, "Anti-spam: message flood").catch(() => {});
      actionName = `timed out (${mins} min)`;
    } else {
      actionName = "messages deleted + warned";
    }
    await dmUser(message, config, actionName, count);
  } else {
    await dmUser(message, config, "messages deleted");
  }

  postModLog(message, actionName, config);
  return true;
}