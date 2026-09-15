import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { updateSettings, getSettings } from "../lib/store.js";
import { C, makeEmbed, okReply, infoReply } from "../lib/embeds.js";
import { template, buildWelcomeEmbed, buildGoodbyeEmbed, DEFAULT_WELCOME, DEFAULT_GOODBYE } from "../lib/welcome.js";
import type { BotCommand } from "./index.js";

export const welcomeCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("welcome")
      .setDescription("Configure welcome & goodbye messages")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName("set")
          .setDescription("Enable welcome/goodbye and set channel + message")
          .addChannelOption((o) => o.setName("channel").setDescription("Channel for welcome messages").setRequired(true).addChannelTypes(ChannelType.GuildText))
          .addStringOption((o) => o.setName("welcome").setDescription("Welcome message. Supports {user}, {username}, {server}, {memberCount}"))
          .addStringOption((o) => o.setName("goodbye").setDescription("Goodbye message. Supports the same placeholders"))
      )
      .addSubcommand((s) =>
        s
          .setName("enable")
          .setDescription("Turn on welcome/goodbye")
          .addBooleanOption((o) => o.setName("welcome").setDescription("Enable welcome messages").setRequired(true))
          .addBooleanOption((o) => o.setName("goodbye").setDescription("Enable goodbye messages").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("preview")
          .setDescription("Preview how welcome/goodbye messages look (rendered with you as a sample member)")
          .addStringOption((o) => o.setName("welcome").setDescription("Preview an alternative welcome template instead of the saved one"))
          .addStringOption((o) => o.setName("goodbye").setDescription("Preview an alternative goodbye template instead of the saved one"))
      )
      .addSubcommand((s) => s.setName("status").setDescription("Show the current welcome config")),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "set") {
        const channel = interaction.options.getChannel("channel", true);
        const welcome = interaction.options.getString("welcome");
        const goodbye = interaction.options.getString("goodbye");
        await updateSettings(interaction.guildId!, {
          welcomeChannel: channel.id,
          ...(welcome ? { welcomeMessage: welcome } : {}),
          ...(goodbye ? { goodbyeMessage: goodbye } : {}),
        });
        await okReply(
          interaction,
          "Welcome channel set",
          `Welcome channel set to ${channel}. Use \`/welcome preview\` to see how the message looks before you finalize it, and \`/welcome enable\` to turn it on.`
        );
      } else if (sub === "enable") {
        const welcome = interaction.options.getBoolean("welcome", true);
        const goodbye = interaction.options.getBoolean("goodbye", true);
        await updateSettings(interaction.guildId!, { welcomeEnabled: welcome, goodbyeEnabled: goodbye });
        await okReply(interaction, "Welcome updated", `Welcome messages: **${welcome ? "ON" : "OFF"}**, goodbye messages: **${goodbye ? "ON" : "OFF"}**.`);
      } else if (sub === "preview") {
        const s = await getSettings(interaction.guildId!);
        const member = interaction.member as GuildMember | null;
        if (!member) {
          await infoReply(interaction, "Preview", "Could not resolve you as a member of this server to preview against.");
          return;
        }
        const welcomeTpl = interaction.options.getString("welcome") ?? s?.welcomeMessage ?? DEFAULT_WELCOME;
        const goodbyeTpl = interaction.options.getString("goodbye") ?? s?.goodbyeMessage ?? DEFAULT_GOODBYE;
        const embeds = [
          buildWelcomeEmbed(template(welcomeTpl, member), member),
          buildGoodbyeEmbed(template(goodbyeTpl, member), member),
        ];
        const statusLine = makeEmbed(
          C.config,
          "Welcome / goodbye preview",
          `**Welcome template:** \`${welcomeTpl}\`\n**Goodbye template:** \`${goodbyeTpl}\``
        );
        await interaction.reply({ embeds: [statusLine, ...embeds], ephemeral: true });
      } else {
        const s = await getSettings(interaction.guildId!);
        const welcomeTpl = s?.welcomeMessage ?? DEFAULT_WELCOME;
        const goodbyeTpl = s?.goodbyeMessage ?? DEFAULT_GOODBYE;
        const lines = [
          `**Welcome enabled:** ${s?.welcomeEnabled ? "yes" : "no"}`,
          `**Welcome channel:** ${s?.welcomeChannel ? `<#${s.welcomeChannel}>` : "none"}`,
          `**Welcome message:** \`${welcomeTpl}\``,
          `**Goodbye enabled:** ${s?.goodbyeEnabled ? "yes" : "no"}`,
          `**Goodbye channel:** ${s?.goodbyeChannel ? `<#${s.goodbyeChannel}>` : "none"}`,
          `**Goodbye message:** \`${goodbyeTpl}\``,
          `Try \`/welcome preview\` to see them rendered.`,
        ];
        await infoReply(interaction, "Welcome config", lines.join("\n"));
      }
    },
  },
];