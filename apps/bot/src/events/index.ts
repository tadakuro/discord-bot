import {
  Client,
  Events,
  type ChatInputCommandInteraction,
} from "discord.js";
import { commandRegistry } from "../commands/index.js";
import { handleMessage } from "./messageCreate.js";
import { handleReaction } from "./reactionAdd.js";
import { handleMemberAdd, handleMemberLeave } from "./memberJoin.js";
import { handleMessageDelete, handleMessageEdit } from "./messageLog.js";
import { handleMemberUpdate } from "./memberUpdate.js";
import { ensureGuild } from "../lib/store.js";
import { makeEmbed, C } from "../lib/embeds.js";

export function registerEvents(client: Client) {
  client.on(Events.ClientReady, (c) => {
    console.log(`Ready as ${c.user.tag}`);
  });

  client.on(Events.GuildCreate, async (guild) => {
    await ensureGuild(guild.id, guild.name, guild.iconURL() ?? null, guild.ownerId);
    console.log(`Joined guild: ${guild.name}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = commandRegistry.get(interaction.commandName);
    if (!cmd) {
      await interaction.reply({ embeds: [makeEmbed(C.error, "Unknown command", "Unknown command.")], ephemeral: true });
      return;
    }
    try {
      await cmd.execute(interaction as ChatInputCommandInteraction, client);
    } catch (err) {
      console.error(`Command ${interaction.commandName} failed:`, err);
      const msg = makeEmbed(C.error, "Something went wrong", "An error occurred while running this command. Please try again.");
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [msg], ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [msg], ephemeral: true }).catch(() => {});
      }
    }
  });

  client.on(Events.MessageCreate, (m) => void handleMessage(m));
  client.on(Events.MessageReactionAdd, (r, u) => void handleReaction(r, u, "add"));
  client.on(Events.MessageReactionRemove, (r, u) => void handleReaction(r, u, "remove"));
  client.on(Events.GuildMemberAdd, (m) => void handleMemberAdd(m, client));
  client.on(Events.GuildMemberRemove, (m) => void handleMemberLeave(m, client));
  client.on(Events.MessageDelete, (m) => void handleMessageDelete(client, m));
  client.on(Events.MessageUpdate, (o, n) => void handleMessageEdit(client, o, n));
  client.on(Events.GuildMemberUpdate, (o, n) => void handleMemberUpdate(client, o, n));
}