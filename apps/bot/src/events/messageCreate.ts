import { ensureGuild, getDb } from "../lib/store.js";
import { xpProfiles, guildSettings, levelRoles, levelFromXp, warns } from "@dcbot/db";
import { and, eq } from "drizzle-orm";
import { uid } from "../lib/uid.js";
import { activeWarnCount, punishAtLimit } from "../lib/punish.js";
import type { Message, TextChannel, NewsChannel, ThreadChannel } from "discord.js";
import type { AutomodConfig } from "@dcbot/db";

type SendableChannel = TextChannel | NewsChannel | ThreadChannel;

const xpCache = new Map<string, number>();

const INVITE_RE = /(?:discord\.(?:gg|com\/invite|gift|app\/channels)\/|invite\.gg\/)[\w-]+/i;

function automodViolation(content: string, automod: AutomodConfig): string | null {
  if (!automod.enabled) return null;
  const lower = content.toLowerCase();

  if (automod.invite && INVITE_RE.test(content)) {
    return "server invite links";
  }

  if (automod.words?.length) {
    const word = automod.words.find((w) => w && lower.includes(w.toLowerCase()));
    if (word) return `blocked word: "${word}"`;
  }

  if (automod.caps) {
    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (letters.length >= 8) {
      const uppercase = letters.replace(/[^A-Z]/g, "").length;
      const percent = (uppercase / letters.length) * 100;
      if (percent >= (automod.capsPercent ?? 70)) {
        return "excessive caps";
      }
    }
  }

  return null;
}

export async function handleMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.guild || message.guildId == null) return;

  await ensureGuild(message.guildId, message.guild.name, message.guild.iconURL() ?? null, message.guild.ownerId);

  const db = getDb();
  const settings = await db.query.guildSettings.findFirst({
    where: eq(guildSettings.guildId, message.guildId),
  });
  if (!settings) return;

  // --- Auto-mod ---
  const automod = settings.automod as AutomodConfig | undefined;
  if (automod?.enabled && message.content) {
    const violation = automodViolation(message.content, automod);
    if (violation) {
      if (message.deletable) await message.delete().catch(() => {});
      const action = automod.action ?? "delete";

      if (action === "warn") {
        await db.insert(warns).values({
          id: uid("warn_"),
          guildId: message.guildId,
          userId: message.author.id,
          moderatorId: message.client.user.id,
          reason: `Auto-mod: ${violation}`,
        });
        const count = await activeWarnCount(message.guildId, message.author.id);
        const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
        let punishment: string | null = null;
        if (member) punishment = await punishAtLimit(message.guild, member, settings, `Auto-mod: ${violation}`);

        message.author
          .send({
            content: `Your message in **${message.guild.name}** was removed (${violation}). ${punishment ? `You were **${punishment}**. Warning ${count}/${settings.warnLimit}` : `Warning ${count}.`}`,
          })
          .catch(() => {});
      } else {
        message.author
          .send({ content: `Your message in **${message.guild.name}** was removed (${violation}).` })
          .catch(() => {});
      }
      return;
    }
  }

  // --- Leveling ---
  if (!settings.levelingEnabled) return;

  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const last = xpCache.get(key) ?? 0;
  const cooldown = (settings.xpCooldownSecs ?? 60) * 1000;

  if (now - last < cooldown) return;
  xpCache.set(key, now);

  const min = settings.xpMin ?? 5;
  const max = settings.xpMax ?? 15;
  const gain = Math.floor(Math.random() * (max - min + 1)) + min;

  const existing =
    (await db.query.xpProfiles.findFirst({
      where: and(eq(xpProfiles.guildId, message.guildId), eq(xpProfiles.userId, message.author.id)),
    })) ?? { guildId: message.guildId, userId: message.author.id, xp: 0 };

  const beforeLevel = levelFromXp(existing.xp);
  const newXp = existing.xp + gain;
  const afterLevel = levelFromXp(newXp);

  await db
    .insert(xpProfiles)
    .values({ guildId: message.guildId, userId: message.author.id, xp: newXp })
    .onConflictDoUpdate({
      target: [xpProfiles.guildId, xpProfiles.userId],
      set: { xp: newXp },
    });

  if (afterLevel > beforeLevel) {
    await handleLevelUp(message, afterLevel);
  }
}

function isSendable(channel: unknown): channel is SendableChannel {
  return typeof channel === "object" && channel !== null && "send" in channel;
}

async function handleLevelUp(message: Message, newLevel: number) {
  const db = getDb();
  const settings = await db.query.guildSettings.findFirst({
    where: eq(guildSettings.guildId, message.guildId!),
  });
  if (!settings) return;

  const msg = (settings.levelUpMessage ?? "{user} leveled up to level {level}!")
    .replace("{user}", `<@${message.author.id}>`)
    .replace("{server}", message.guild!.name)
    .replace("{level}", String(newLevel));

  const target = settings.levelUpChannel
    ? await message.guild!.channels.fetch(settings.levelUpChannel).catch(() => null)
    : message.channel;

  if (isSendable(target)) {
    await target.send(msg).catch(() => {});
  } else if (isSendable(message.channel)) {
    await message.channel.send(msg).catch(() => {});
  }

  const roles = await db
    .select()
    .from(levelRoles)
    .where(and(eq(levelRoles.guildId, message.guildId!), eq(levelRoles.level, newLevel)));

  if (roles.length === 0) return;
  const member = message.member ?? (await message.guild!.members.fetch(message.author.id).catch(() => null));
  if (!member) return;

  if (settings.stackLevelRoles) {
    await member.roles.add(roles.map((r) => r.roleId)).catch(() => {});
  } else {
    const current = await db
      .select()
      .from(levelRoles)
      .where(eq(levelRoles.guildId, message.guildId!));
    const highest = current
      .filter((r) => r.level <= newLevel)
      .sort((a, b) => b.level - a.level)[0];
    if (highest) {
      await member.roles.remove(
        current.filter((r) => r.level !== highest.level).map((r) => r.roleId)
      ).catch(() => {});
      await member.roles.add(highest.roleId).catch(() => {});
    }
  }
}