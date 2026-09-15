import { type Client, EmbedBuilder, type GuildMember } from "discord.js";
import { getDb, getSettings } from "./store.js";
import { reminders, rssFeeds, birthdays, giveaways } from "@dcbot/db";
import { lt, lte, eq, and } from "drizzle-orm";
import { fmtRSSItem, parseRSS } from "./rss.js";
import { C, makeEmbed } from "./embeds.js";
import { formatDuration } from "./web.js";

const GIVEAWAY_EMOJI = "🎉";

let started = false;

export function startJobs(client: Client) {
  if (started) return;
  started = true;

  setInterval(() => void tickReminders(client), 30_000);
  setInterval(() => void tickRSS(client), 5 * 60_000);
  setInterval(() => void tickBirthdays(client), 60 * 60_000);
  setInterval(() => void tickGiveaways(client), 30_000);
  void tickGiveaways(client);
  console.log("[jobs] reminders, rss, birthdays, giveaways enabled");
}

async function tickReminders(client: Client) {
  try {
    const db = getDb();
    const now = new Date();
    const due = await db.select().from(reminders).where(lte(reminders.remindAt, now));
    if (due.length === 0) return;
    for (const r of due) {
      await db.delete(reminders).where(eq(reminders.id, r.id));
      const user = await client.users.fetch(r.userId).catch(() => null);
      if (!user) continue;
      const embed = new EmbedBuilder()
        .setColor(C.info)
        .setTitle("Reminder")
        .setDescription(r.text)
        .setFooter({ text: `Set ${r.createdAt.toISOString().replace("T", " ").slice(0, 19)} (UTC)` });
      await user.send({ embeds: [embed] }).catch(() => {
        if (r.channelId) client.channels.fetch(r.channelId).then((ch) => {
          if (ch && "send" in ch) {
            const target = ch as { send(p: unknown): Promise<unknown> };
            void target.send({ content: `<@${r.userId}>`, embeds: [embed] }).catch(() => {});
          }
        }).catch(() => {});
      });
    }
    console.log(`[jobs] delivered ${due.length} reminder(s)`);
  } catch (err) {
    console.error("[jobs] reminders failed:", err);
  }
}

async function tickRSS(client: Client) {
  try {
    const db = getDb();
    const feeds = await db.select().from(rssFeeds);
    for (const feed of feeds) {
      try {
        const items = await parseRSS(feed.url);
        if (!items || items.length === 0) continue;
        const newest = items[0];
        if (feed.lastItem && newest.guid === feed.lastItem) continue;
        const channel = await client.channels.fetch(feed.channelId).catch(() => null);
        if (!channel || !("send" in channel)) continue;
        const fresh = feed.lastItem ? items.filter((it) => it.guid !== feed.lastItem).slice(0, 5) : [newest];
        for (const item of fresh.reverse()) {
          await channel.send({ embeds: [fmtRSSItem(feed.url, item)] }).catch(() => {});
        }
        await db.update(rssFeeds).set({ lastItem: newest.guid }).where(eq(rssFeeds.id, feed.id));
      } catch (err) {
        console.error(`[jobs] rss ${feed.url} failed:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("[jobs] rss sweep failed:", err);
  }
}

const postedBirthdays = new Set<string>();
let postedDay = "";

async function tickBirthdays(client: Client) {
  try {
    const now = new Date();
    const key = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
    if (postedDay !== key) {
      postedBirthdays.clear();
      postedDay = key;
    }
    const db = getDb();
    const today = await db
      .select()
      .from(birthdays)
      .where(and(eq(birthdays.month, now.getUTCMonth() + 1), eq(birthdays.day, now.getUTCDate())));
    const byGuild = new Map<string, typeof today>();
    for (const b of today) {
      if (postedBirthdays.has(b.guildId)) continue;
      if (!byGuild.has(b.guildId)) byGuild.set(b.guildId, []);
      byGuild.get(b.guildId)!.push(b);
    }
    if (byGuild.size === 0) return;
    for (const [guildId, list] of byGuild) {
      const s = await getSettings(guildId);
      if (!s?.birthdayChannel) continue;
      const channel = await client.channels.fetch(s.birthdayChannel).catch(() => null);
      if (!channel || !("send" in channel)) continue;
      const members = await Promise.all(
        list.map(async (b) => {
          const m = await client.guilds.cache.get(guildId)?.members.fetch(b.userId).catch(() => null);
          return m ? m : null;
        })
      );
      const names = members.filter((m): m is GuildMember => !!m).map((m) => `<@${m.id}>`).join(", ");
      if (!names) continue;
      const embed = new EmbedBuilder()
        .setColor(C.success)
        .setTitle("🎂 Birthday today")
        .setDescription(`${names}${list.length === 1 ? " was" : " were"} born today — wish them a happy birthday!`);
      await channel.send({ embeds: [embed] }).catch(() => {});
      postedBirthdays.add(guildId);
    }
  } catch (err) {
    console.error("[jobs] birthdays failed:", err);
  }
}

async function tickGiveaways(client: Client) {
  try {
    const db = getDb();
    const now = new Date();
    const due = await db.select().from(giveaways).where(and(eq(giveaways.ended, false), lte(giveaways.endsAt, now)));
    for (const g of due) {
      await db.update(giveaways).set({ ended: true }).where(eq(giveaways.id, g.id));
      await concludeGiveaway(client, g);
    }
  } catch (err) {
    console.error("[jobs] giveaways failed:", err);
  }
}

export async function concludeGiveaway(client: Client, g: { id: string; channelId: string; messageId: string | null; prize: string; winners: number }) {
  try {
    const channel = await client.channels.fetch(g.channelId).catch(() => null);
    const broadcastTarget = channel && "send" in channel ? (channel as { send: (p: unknown) => Promise<unknown> }) : null;
    const message = g.messageId && channel && "messages" in channel ? await channel.messages.fetch(g.messageId).catch(() => null) : null;
    let entrants: string[] = [];
    if (message) {
      const reaction = message.reactions.cache.get(GIVEAWAY_EMOJI);
      if (reaction) {
        const users = await reaction.users.fetch({ limit: 100 }).catch(() => null);
        if (users) entrants = users.filter((u) => !u.bot).map((u) => u.id);
      }
    }
    const winnerIds = pickWinners(entrants, g.winners);
    const embed = new EmbedBuilder()
      .setColor(C.success)
      .setTitle("🎉 Giveaway ended")
      .setDescription(`**${g.prize}**\n\n${winnerIds.length ? winnerIds.map((w) => `<@${w}>`).join(", ") : "No valid entries."}`)
      .setFooter({ text: "Thanks to everyone who joined!" });
    await broadcastTarget?.send({ content: winnerIds.map((w) => `<@${w}>`).join(" "), embeds: [embed] }).catch(() => {});
    await message?.edit({ embeds: [makeEmbed(C.success, "🎉 Giveaway ended", `**${g.prize}** — winners: ${winnerIds.length ? winnerIds.map((w) => `<@${w}>`).join(", ") : "none"}`)] }).catch(() => {});
  } catch (err) {
    console.error("Giveaway conclude failed:", err);
  }
}

export function pickWinners(entrants: string[], count: number): string[] {
  if (entrants.length === 0 || count <= 0) return [];
  const pool = [...entrants];
  const out: string[] = [];
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export { formatDuration };