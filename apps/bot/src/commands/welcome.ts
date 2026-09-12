import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { updateSettings, getSettings } from "../lib/store.js";
import { C, makeEmbed, okReply, infoReply } from "../lib/embeds.js";
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
          .addStringOption((o) => o.setName("welcome").setDescription("Welcome message. Use {user} and {server}"))
          .addStringOption((o) => o.setName("goodbye").setDescription("Goodbye message. Use {user} and {server}"))
      )
      .addSubcommand((s) =>
        s
          .setName("enable")
          .setDescription("Turn on welcome/goodbye")
          .addBooleanOption((o) => o.setName("welcome").setDescription("Enable welcome messages").setRequired(true))
          .addBooleanOption((o) => o.setName("goodbye").setDescription("Enable goodbye messages").setRequired(true))
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
          `Welcome channel set to ${channel}. Configure the message template and toggles with \`/welcome set\` and \`/welcome enable\`.`
        );
      } else if (sub === "enable") {
        const welcome = interaction.options.getBoolean("welcome", true);
        const goodbye = interaction.options.getBoolean("goodbye", true);
        await updateSettings(interaction.guildId!, { welcomeEnabled: welcome, goodbyeEnabled: goodbye });
        await okReply(interaction, "Welcome updated", `Welcome messages: **${welcome ? "ON" : "OFF"}**, goodbye messages: **${goodbye ? "ON" : "OFF"}**.`);
      } else {
        const s = await getSettings(interaction.guildId!);
        const lines = [
          `**Welcome enabled:** ${s?.welcomeEnabled ? "yes" : "no"}`,
          `**Welcome channel:** ${s?.welcomeChannel ? `<#${s.welcomeChannel}>` : "none"}`,
          `**Welcome message:** \`${s?.welcomeMessage ?? "-"}\``,
          `**Goodbye enabled:** ${s?.goodbyeEnabled ? "yes" : "no"}`,
          `**Goodbye channel:** ${s?.goodbyeChannel ? `<#${s.goodbyeChannel}>` : "none"}`,
          `**Goodbye message:** \`${s?.goodbyeMessage ?? "-"}\``,
        ];
        await infoReply(interaction, "Welcome config", lines.join("\n"));
      }
    },
  },
];