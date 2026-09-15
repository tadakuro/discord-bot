import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { commandRegistry } from "./index.js";
import { getSettings } from "../lib/store.js";
import { C, makeEmbed, okReply, errReply } from "../lib/embeds.js";
import type { BotCommand } from "./index.js";

const CATEGORY_ORDER = ["Moderation", "Auto-mod", "Anti-spam", "Leveling", "Welcome", "Reaction Roles", "Configuration", "AI", "Utility"];

type OptJson = { type?: number; name?: string; description?: string; options?: OptJson[] };

function summarizeSubcommands(data: { toJSON(): unknown }): string[] {
  const json = data.toJSON() as { options?: OptJson[] };
  const out: string[] = [];
  for (const opt of json?.options ?? []) {
    if (opt.type === 1 && opt.name) out.push(opt.name);
    else if (opt.type === 2 && opt.name) {
      for (const sub of opt.options ?? []) if (sub.name) out.push(`${opt.name}:${sub.name}`);
    }
  }
  return out;
}

function commandLine(cmd: { data: { name: string; description?: string; toJSON(): unknown } }) {
  const name = `\`/${cmd.data.name}\``;
  const desc = (cmd.data as { description?: string }).description;
  const subs = summarizeSubcommands(cmd.data);
  if (subs.length) return `${name} — ${desc}\n  _subcommands: \`${subs.join("` · `")}\`_`;
  return `${name} — ${desc}`;
}

export const utilityCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("help")
      .setDescription("List all commands"),
    async execute(interaction) {
      const grouped = new Map<string, string[]>();
      for (const cmd of commandRegistry.values()) {
        const cat = cmd.category ?? "Other";
        const arr = grouped.get(cat) ?? [];
        arr.push(commandLine(cmd));
        grouped.set(cat, arr);
      }
      const embed = new EmbedBuilder()
        .setColor(C.info)
        .setTitle("Help — All commands")
        .setDescription(
          `The bot covers every common MEE6 / Carl-bot feature. Per-server modules are configured with Manage Guild / Manage Roles / Moderate Members permissions.\n\nUse **\`/settings\`** for a server-wide overview and **\`/help <command>\` guidance below.`
        )
        .setFooter({ text: `${interaction.client.user?.username ?? "DCBot"} · ${commandRegistry.size} commands` });
      const order = [...CATEGORY_ORDER].filter((c) => grouped.has(c));
      const rest = [...grouped.keys()].filter((c) => !CATEGORY_ORDER.includes(c));
      for (const cat of [...order, ...rest]) {
        const lines = grouped.get(cat)!;
        const chunks: string[] = [];
        let cur = "";
        for (const line of lines) {
          if (cur && cur.length + line.length + 1 > 1000) {
            chunks.push(cur);
            cur = line;
          } else {
            cur = cur ? cur + "\n" + line : line;
          }
        }
        if (cur) chunks.push(cur);
        for (let i = 0; i < chunks.length; i++) {
          embed.addFields({ name: `**${cat}**${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ""}`, value: chunks[i], inline: false });
        }
      }
      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder().setName("ping").setDescription("Bot latency"),
    async execute(interaction, client) {
      const now = Date.now();
      await interaction.deferReply({ ephemeral: true });
      const roundtrip = Date.now() - now;
      await interaction.editReply({
        embeds: [
          makeEmbed(
            C.info,
            "Pong!",
            `**WebSocket:** \`${client.ws.ping}ms\`\n**Roundtrip:** \`${roundtrip}ms\``,
          ).setFooter({ text: "Utility" }),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("serverinfo")
      .setDescription("Information about this server"),
    async execute(interaction) {
      const g = interaction.guild!;
      const boost = g.premiumSubscriptionCount ?? 0;
      const embed = new EmbedBuilder()
        .setColor(C.utility)
        .setTitle(g.name)
        .setThumbnail(g.iconURL({ size: 256 }) ?? null)
        .setDescription(
          [
            `**ID:** \`${g.id}\``,
            `**Owner:** <@${g.ownerId}>`,
            `**Members:** ${g.memberCount}`,
            `**Boosts:** ${boost}`,
            `**Created:** <t:${Math.floor(g.createdTimestamp / 1000)}:R>`,
          ].join("\n")
        )
        .setFooter({ text: "Utility" });
      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("userinfo")
      .setDescription("Information about a member")
      .addUserOption((o) => o.setName("user").setDescription("User to inspect")),
    async execute(interaction) {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const member = interaction.guild!.members.cache.get(user.id) ?? (await interaction.guild!.members.fetch(user.id).catch(() => null));
      const roles = member
        ? [...member.roles.cache.values()]
            .filter((r) => r.id !== r.guild.id)
            .map((r) => `<@&${r.id}>`)
            .slice(0, 20)
            .join(" ") || "—"
        : "—";
      const embed = new EmbedBuilder()
        .setColor(C.utility)
        .setTitle(user.tag)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setDescription(
          [
            `**ID:** \`${user.id}\``,
            `**Bot:** ${user.bot ? "yes" : "no"}`,
            `**Joined server:** ${member?.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "—"}`,
            `**Account created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
            `**Roles:** ${roles}`,
          ].join("\n")
        )
        .setFooter({ text: "Utility" });
      await interaction.reply({ embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("avatar")
      .setDescription("Get a user's avatar")
      .addUserOption((o) => o.setName("user").setDescription("User to get the avatar of")),
    async execute(interaction) {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const url = user.displayAvatarURL({ size: 1024 });
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(C.utility).setTitle(`${user.tag}'s avatar`).setImage(url).setFooter({ text: "Utility" })],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("announce")
      .setDescription("Post an announcement embed in a channel")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption((o) => o.setName("channel").setDescription("Channel to post in").setRequired(true))
      .addStringOption((o) => o.setName("message").setDescription("Announcement text").setRequired(true)),
    async execute(interaction) {
      const channel = interaction.options.getChannel("channel", true);
      const message = interaction.options.getString("message", true);
      if (!("send" in channel)) {
        await errReply(interaction, "Invalid channel", "Please pick a text channel.");
        return;
      }
      await channel.send({
        embeds: [new EmbedBuilder().setColor(C.utility).setTitle("📢 Announcement").setDescription(message).setFooter({ text: "Astalon" })],
      });
      await okReply(interaction, "Announcement posted", `Announcement posted in ${channel}.`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("poll")
      .setDescription("Create a poll")
      .addStringOption((o) => o.setName("question").setDescription("Poll question").setRequired(true))
      .addStringOption((o) => o.setName("option1").setDescription("First option").setRequired(true))
      .addStringOption((o) => o.setName("option2").setDescription("Second option").setRequired(true))
      .addStringOption((o) => o.setName("option3").setDescription("Third option"))
      .addStringOption((o) => o.setName("option4").setDescription("Fourth option")),
    async execute(interaction) {
      const question = interaction.options.getString("question", true);
      const options = [1, 2, 3, 4]
        .map((i) => interaction.options.getString(`option${i}`))
        .filter((o): o is string => !!o);
      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      const embed = new EmbedBuilder()
        .setColor(C.utility)
        .setTitle(question)
        .setDescription(options.map((o, i) => `${emojis[i]} ${o}`).join("\n"))
        .setFooter({ text: "Astalon" });
      const sent = await interaction.reply({ embeds: [embed] }).catch(() => null);
      if (!sent) return;
      const msg = await interaction.fetchReply().catch(() => null);
      if (!msg) return;
      for (let i = 0; i < options.length; i++) {
        await msg.react(emojis[i]).catch(() => {});
      }
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("settings")
      .setDescription("Overview of all configured modules for this server")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const s = await getSettings(interaction.guildId!);
      const lines = [
        `**Leveling:** ${s?.levelingEnabled ? "on" : "off"} · ${s?.xpMin ?? 5}-${s?.xpMax ?? 15} XP/msg · cooldown ${s?.xpCooldownSecs ?? 60}s`,
        `**Welcome:** ${s?.welcomeEnabled ? "on" : "off"} ${s?.welcomeChannel ? `(<#${s.welcomeChannel}>)` : ""}`,
        `**Goodbye:** ${s?.goodbyeEnabled ? "on" : "off"} ${s?.goodbyeChannel ? `(<#${s.goodbyeChannel}>)` : ""}`,
        `**Logging:** ${s?.loggingEnabled ? "on" : "off"} ${s?.logChannel ? `(<#${s.logChannel}>)` : ""} · events: ${(s?.logEvents ?? []).length || "none"}`,
        `**Auto-mod:** ${s?.automod?.enabled ? "on" : "off"} · words: ${s?.automod?.words?.length ?? 0} · invites: ${s?.automod?.invite ? "on" : "off"} · caps: ${s?.automod?.caps ? "on" : "off"}`,
        `**Anti-spam:** ${s?.antispam?.enabled ? `on (${s?.antispam?.limit ?? 5} msgs / ${s?.antispam?.windowSecs ?? 5}s)` : "off"}`,
        `**Warn limit:** ${s?.warnLimit ?? 0} (action: ${s?.warnAction ?? "timeout"}) · mod log ${s?.modLogChannel ? `(<#${s.modLogChannel}>)` : "not set"}`,
        `**Prefix:** \`${s?.prefix ?? "!"}\` — prefix commands work like \`${s?.prefix ?? "!"}rank\``,
      ];
      await interaction.reply({
        embeds: [makeEmbed(C.config, "Server settings", lines.join("\n"))],
        ephemeral: true,
      });
    },
  },
];