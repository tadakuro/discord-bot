import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getSettings } from "../lib/store.js";
import { C, makeEmbed, okReply, errReply, infoReply } from "../lib/embeds.js";
import { getWeather, getCrypto, getDictionary, formatDuration } from "../lib/web.js";
import type { BotCommand } from "./index.js";

function parseMessageRef(raw: string): { channelId: string; messageId: string } | null {
  const m = raw.match(/channels\/(\d+)\/(\d+)/) ?? raw.match(/^(\d{17,21})-(\d{17,21})$/);
  return m ? { channelId: m[1], messageId: m[2] } : null;
}

export const utilityExtraCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder().setName("servericon").setDescription("Show the server icon").addBooleanOption((o) => o.setName("server").setDescription("Include the server-wide icon instead of your avatar")),
    async execute(interaction) {
      const icon = interaction.guild?.iconURL({ size: 1024 });
      if (!icon) {
        await errReply(interaction, "No icon", "This server has no icon.");
        return;
      }
      await interaction.reply({ embeds: [makeEmbed(C.utility, interaction.guild!.name).setImage(icon)] });
    },
  },

  {
    data: new SlashCommandBuilder().setName("banner").setDescription("Show the server banner"),
    async execute(interaction) {
      const banner = interaction.guild?.bannerURL({ size: 1024 });
      if (!banner) {
        await errReply(interaction, "No banner", "This server has no banner (boosted server).");
        return;
      }
      await interaction.reply({ embeds: [makeEmbed(C.utility, interaction.guild!.name).setImage(banner)] });
    },
  },

  {
    data: new SlashCommandBuilder().setName("boosts").setDescription("List server nitro boosters"),
    async execute(interaction) {
      const guild = interaction.guild!;
      const boosters = [...guild.members.cache.values()].filter((m) => m.premiumSinceTimestamp).sort((a, b) => a.premiumSinceTimestamp! - b.premiumSinceTimestamp!);
      if (boosters.length === 0) {
        await errReply(interaction, "No boosters", "This server has no nitro boosters right now.");
        return;
      }
      const lines = boosters.slice(0, 20).map((m) => `<@${m.id}> — since <t:${Math.floor(m.premiumSinceTimestamp! / 1000)}:d>`);
      await okReply(interaction, `Boosters (${boosters.length}) · level ${guild.premiumTier}`, lines.join("\n"));
    },
  },

  {
    data: new SlashCommandBuilder().setName("botinfo").setDescription("Show bot stats and invite link"),
    async execute(interaction, client) {
      const uptime = formatDuration(client.uptime ?? 0);
      const channels = client.channels.cache.size;
      const users = client.users.cache.size;
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(C.utility)
            .setAuthor({ name: client.user!.username, iconURL: client.user!.displayAvatarURL() })
            .setDescription("Discord bot running on this server with slash + prefix support (default prefix `!`).")
            .addFields(
              { name: "Uptime", value: uptime, inline: true },
              { name: "Guilds", value: String(client.guilds.cache.size), inline: true },
              { name: "Channels", value: String(channels), inline: true },
              { name: "Cached users", value: String(users), inline: true },
              { name: "Invite", value: `[Add to your server](https://discord.com/api/oauth2/authorize?client_id=${client.user!.id}&permissions=8&scope=bot%20applications.commands)`, inline: true }
            ),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder().setName("uptime").setDescription("Show how long the bot has been running"),
    async execute(interaction, client) {
      const up = client.uptime;
      await okReply(interaction, "Uptime", `The bot has been running for **${up ? formatDuration(up) : "?"}**.\nLast restart: ${up ? `<t:${Math.floor(Date.now() / 1000 - up / 1000)}:R>` : "-"}`);
    },
  },

  {
    data: new SlashCommandBuilder().setName("quote").setDescription("Quote a message").addStringOption((o) => o.setName("message").setDescription("Message link or channelId-messageId").setRequired(true)),
    async execute(interaction) {
      const ref = parseMessageRef(interaction.options.getString("message", true));
      if (!ref) {
        await errReply(interaction, "Bad link", "Send a message link or channelId-messageId.");
        return;
      }
      const channel = await interaction.guild!.channels.fetch(ref.channelId).catch(() => null);
      if (!channel || !("messages" in channel)) {
        await errReply(interaction, "Bad channel", "Could not reach that channel.");
        return;
      }
      const message = await channel.messages.fetch(ref.messageId).catch(() => null);
      if (!message) {
        await errReply(interaction, "Not found", "Could not fetch that message.");
        return;
      }
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(C.utility)
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content || "*(no text)*")
            .addFields({ name: "Go to message", value: `[#${channel.name}](${message.url})` })
            .setFooter({ text: `${message.createdAt.toISOString().slice(0, 10)}` }),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder().setName("invite").setDescription("Get the bot invite link").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction, client) {
      const url = `https://discord.com/api/oauth2/authorize?client_id=${client.user!.id}&permissions=8&scope=bot%20applications.commands`;
      await okReply(interaction, "Invite me", `[\u2026 Add to another server (admin perms)](<${url}>)`);
    },
  },

  {
    data: new SlashCommandBuilder().setName("report").setDescription("Report a member to the moderation channel").addUserOption((o) => o.setName("user").setDescription("Member to report").setRequired(true)).addStringOption((o) => o.setName("reason").setDescription("Why you're reporting them").setRequired(true)),
    async execute(interaction) {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason", true);
      const s = await getSettings(interaction.guildId!);
      if (!s?.modLogChannel) {
        await errReply(interaction, "Not configured", "Ask a moderator to set a mod-log channel with `/warnconfig set channel`.");
        return;
      }
      const channel = await interaction.guild!.channels.fetch(s.modLogChannel).catch(() => null);
      if (!channel || !("send" in channel)) {
        await errReply(interaction, "Not configured", "The mod-log channel isn't available.");
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(C.error)
        .setTitle("New report")
        .setDescription(`**Reported:** <@${user.id}> (${user.tag})\n**By:** <@${interaction.user.id}>\n**Reason:** ${reason}`)
        .setFooter({ text: interaction.guild!.name });
      await channel.send({ embeds: [embed] });
      await okReply(interaction, "Report sent", "The moderators have been notified.");
    },
  },

  {
    data: new SlashCommandBuilder().setName("weather").setDescription("Current weather for a city (Open-Meteo)").addStringOption((o) => o.setName("city").setDescription("City name").setRequired(true)),
    async execute(interaction) {
      const city = interaction.options.getString("city", true);
      await interaction.deferReply();
      const w = await getWeather(city);
      if (!w) {
        await errReply(interaction, "Not found", `No weather data for **${city}**.`, { followUp: true });
        return;
      }
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor(C.utility)
            .setTitle(`${w.icon} ${w.city}`)
            .addFields(
              { name: "Conditions", value: w.desc, inline: true },
              { name: "Temperature", value: `${w.temp}°C (feels ${w.feels}°C)`, inline: true },
              { name: "Humidity", value: `${w.humidity}%`, inline: true },
              { name: "Wind", value: `${w.wind} km/h`, inline: true }
            ),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder().setName("crypto").setDescription("Coin price lookup (CoinGecko)").addStringOption((o) => o.setName("coin").setDescription("Name / symbol, e.g. bitcoin or btc").setRequired(true)),
    async execute(interaction) {
      const coin = interaction.options.getString("coin", true);
      await interaction.deferReply();
      const c = await getCrypto(coin);
      if (!c) {
        await errReply(interaction, "Not found", `No coin matched **${coin}**.`, { followUp: true });
        return;
      }
      const up = c.change24h >= 0;
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor(up ? C.success : C.error)
            .setTitle(`${c.name} (${c.symbol.toUpperCase()})`)
            .setDescription(`$${c.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n24h: **${up ? "+" : ""}${c.change24h.toFixed(2)}%**`)
            .addFields({ name: "Market cap", value: `$${(c.marketCap / 1e9).toFixed(2)}B` }),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder().setName("dictionary").setDescription("Look up a word (dictionaryapi.dev)").addStringOption((o) => o.setName("word").setDescription("Word to define").setRequired(true)),
    async execute(interaction) {
      const word = interaction.options.getString("word", true);
      await interaction.deferReply();
      const d = await getDictionary(word);
      if (!d) {
        await errReply(interaction, "Not found", `No definition for **${word}**.`, { followUp: true });
        return;
      }
      const fields: { name: string; value: string }[] = [];
      for (const m of d.meanings.slice(0, 3)) {
        const defs = m.definitions.slice(0, 2).map((x) => x.definition + (x.example ? `\n*"${x.example}"*` : "")).join("\n");
        fields.push({ name: `(${m.partOfSpeech})`, value: defs });
      }
      await interaction.followUp({
        embeds: [new EmbedBuilder().setColor(C.utility).setTitle(`${d.word} ${d.phonetic ? `· ${d.phonetic}` : ""}`).addFields(fields)],
      });
    },
  },
];