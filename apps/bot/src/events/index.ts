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
import { ensureGuild, getSettings } from "../lib/store.js";
import { makeEmbed, C } from "../lib/embeds.js";
import { handleStar, recordDeleted, recordEdited } from "../commands/starboard.js";
import { handleVoiceState } from "../lib/tempvoice.js";
import { TICKET_OPEN_ID, VERIFY_ID } from "../commands/engagement.js";
import type { TextChannel } from "discord.js";

const handledInteractions = new Set<string>();
setInterval(() => handledInteractions.clear(), 10 * 60 * 1000).unref();
function alreadyHandled(id: string): boolean {
  if (handledInteractions.has(id)) return true;
  handledInteractions.add(id);
  return false;
}

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
    if (alreadyHandled(interaction.id)) return;
    const cmd = commandRegistry.get(interaction.commandName);
    if (!cmd) {
      await interaction.reply({ embeds: [makeEmbed(C.error, "Unknown command", "Unknown command.")], ephemeral: true });
      return;
    }
    try {
      await cmd.execute(interaction as ChatInputCommandInteraction, client);
    } catch (err) {
      const e = err as { code?: number } | undefined;
      if (e?.code === 40060 || e?.code === 10062) return;
      console.error(`Command ${interaction.commandName} failed:`, err);
      const msg = makeEmbed(C.error, "Something went wrong", "An error occurred while running this command. Please try again.");
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [msg], ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [msg], ephemeral: true }).catch(() => {});
        }
      } catch {
        /* interaction already gone */
      }
    }
  });

  client.on(Events.MessageCreate, (m) => void handleMessage(m));
  client.on(Events.MessageReactionAdd, (r, u) => {
    void handleReaction(r, u, "add");
    void handleStar(r, "add", client);
  });
  client.on(Events.MessageReactionRemove, (r, u) => {
    void handleReaction(r, u, "remove");
    void handleStar(r, "remove", client);
  });
  client.on(Events.GuildMemberAdd, (m) => void handleMemberAdd(m, client));
  client.on(Events.GuildMemberRemove, (m) => void handleMemberLeave(m, client));
  client.on(Events.MessageDelete, (m) => {
    void handleMessageDelete(client, m);
    void recordDeleted(m);
  });
  client.on(Events.MessageUpdate, (o, n) => {
    void handleMessageEdit(client, o, n);
    void recordEdited(o, n);
  });
  client.on(Events.GuildMemberUpdate, (o, n) => void handleMemberUpdate(client, o, n));
  client.on(Events.VoiceStateUpdate, (o, n) => void handleVoiceState(o, n));

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId === VERIFY_ID) {
      if (!interaction.inGuild()) return;
      const settings = await getSettings(interaction.guildId);
      if (!settings?.verifyRole) {
        await interaction.reply({ embeds: [makeEmbed(C.error, "Not configured", "Verify isn't set up. Ask a moderator to run `/verify setup`.")], ephemeral: true });
        return;
      }
      const member = interaction.member;
      if (member && "roles" in member && !Array.isArray(member.roles)) {
        await member.roles.add(settings.verifyRole);
        await interaction.reply({ embeds: [makeEmbed(C.success, "Verified", "Welcome in!")], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [makeEmbed(C.error, "Try again", "Couldn't assign the role.")], ephemeral: true });
      }
      return;
    }
    if (interaction.customId === TICKET_OPEN_ID) {
      if (!interaction.inGuild() || !interaction.channel || !interaction.channel.isTextBased()) return;
      const settings = await getSettings(interaction.guildId);
      if (!settings?.ticketChannel) {
        await interaction.reply({ embeds: [makeEmbed(C.error, "Not configured", "Tickets aren't set up.")], ephemeral: true });
        return;
      }
      const baseChannel = interaction.channel as TextChannel;
      const member = interaction.member;
      if (!member || !("user" in member)) return;
      const label = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "member";
      const thread = await baseChannel.threads.create({
        name: `${label}-${Math.random().toString(36).slice(2, 6)}`,
        autoArchiveDuration: 10080,
      }).catch(() => null);
      if (!thread) {
        await interaction.reply({ embeds: [makeEmbed(C.error, "Failed", "Could not create the ticket thread.")], ephemeral: true });
        return;
      }
      if (thread.type === 12) await thread.members.add(interaction.user.id).catch(() => {});
      await thread.send({ content: `<@${interaction.user.id}>`, embeds: [makeEmbed(C.info, "Ticket opened", "Support will be with you shortly. Close with `/ticket close`.")] });
      await interaction.reply({ embeds: [makeEmbed(C.success, "Ticket opened", `Your ticket: ${thread}`)], ephemeral: true });
    }
  });
}