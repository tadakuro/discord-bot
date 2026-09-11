import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { commandRegistry } from "./index.js";
import { getSettings } from "../lib/store.js";
import type { BotCommand } from "./index.js";

export const utilityCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("help")
      .setDescription("List all commands"),
    async execute(interaction) {
      const lines = [...commandRegistry.values()].map((c) => `\`/${c.data.name}\``).join(" ");
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("Commands")
            .setDescription(
              `${lines}\n\nAll modules are configured per-server via slash commands with Manage Guild / Manage Roles / Moderate Members. Use \`/settings\` to see what's on.`
            ),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder().setName("ping").setDescription("Bot latency"),
    async execute(interaction, client) {
      const now = Date.now();
      await interaction.deferReply({ ephemeral: true });
      const roundtrip = Date.now() - now;
      await interaction.editReply({ content: `Pong! 🏓 WebSocket **${client.ws.ping}ms** · Roundtrip **${roundtrip}ms**` });
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
        .setColor(0x5865f2)
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
        );
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
        .setColor(0x5865f2)
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
        );
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
        embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`${user.tag}'s avatar`).setImage(url)],
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
        await interaction.reply({ content: "Please pick a text channel.", ephemeral: true });
        return;
      }
      await channel.send({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("📢 Announcement").setDescription(message)],
      });
      await interaction.reply({ content: `Announcement posted in ${channel}.`, ephemeral: true });
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
        .setColor(0x5865f2)
        .setTitle(question)
        .setDescription(options.map((o, i) => `${emojis[i]} ${o}`).join("\n"));
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
        `**Warn limit:** ${s?.warnLimit ?? 0} (action: ${s?.warnAction ?? "timeout"}) · mod log ${s?.modLogChannel ? `(<#${s.modLogChannel}>)` : "not set"}`,
      ];
      await interaction.reply({ content: `**Server settings**\n${lines.join("\n")}`, ephemeral: true });
    },
  },
];