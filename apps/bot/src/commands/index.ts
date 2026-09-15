import { Collection, REST, Routes, type ChatInputCommandInteraction, type Client } from "discord.js";
import { moderationCommands } from "./moderation.js";
import { moderationExtraCommands } from "./moderationExtras.js";
import { levelingCommands } from "./leveling.js";
import { reactionRoleCommands } from "./reactionrole.js";
import { welcomeCommands } from "./welcome.js";
import { configCommands } from "./config.js";
import { automodCommands } from "./automod.js";
import { antispamCommands } from "./antispam.js";
import { aiCommands } from "./ai.js";
import { utilityCommands } from "./utility.js";
import { modAdminCommands } from "./modAdmin.js";
import { modChannelCommands } from "./modChannels.js";
import { modInfoCommands } from "./modInfo.js";
import { utilityExtraCommands } from "./utilityExtra.js";
import { afkCommands } from "./afk.js";
import { remindCommands } from "./remind.js";
import { tagCommands } from "./tags.js";
import { starCommands } from "./starboard.js";
import { engagementCommands } from "./engagement.js";
import { feedCommands } from "./feeds.js";

export type BotCommand = {
  data: { name: string; description?: string; toJSON(): unknown };
  execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;
  category?: string;
};

export const commands = new Collection<string, BotCommand>();

export function register(commandsArr: BotCommand[], category?: string) {
  for (const cmd of commandsArr) commands.set(cmd.data.name, { ...cmd, category });
}

register(moderationCommands, "Moderation");
register(moderationExtraCommands, "Moderation");
register(levelingCommands, "Leveling");
register(reactionRoleCommands, "Reaction Roles");
register(welcomeCommands, "Welcome");
register(configCommands, "Configuration");
register(automodCommands, "Auto-mod");
register(antispamCommands, "Anti-spam");
register(aiCommands, "AI");
register(utilityCommands, "Utility");
register(modAdminCommands, "Moderation");
register(modChannelCommands, "Moderation");
register(modInfoCommands, "Moderation");
register(utilityExtraCommands, "Utility");
register(afkCommands, "Utility");
register(remindCommands, "Utility");
register(tagCommands, "Custom Commands");
register(starCommands, "Engagement");
register(engagementCommands, "Engagement");
register(feedCommands, "Integration");

let lastPayloadJson = "";

export async function registerCommands(client: Client, force = false) {
  if (!client.user) return false;
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
  const payload = commands.map((c) => c.data.toJSON());
  const json = JSON.stringify(payload);
  if (!force && json === lastPayloadJson) return false;
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: payload });
    console.log(`Registered ${payload.length} slash commands globally.`);
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: payload });
      console.log(`Registered ${payload.length} slash commands for guild ${guild.name} (${guild.id}).`);
    } catch (err) {
      console.error(`Failed to register commands for guild ${guild.id}:`, err);
    }
  }
  lastPayloadJson = json;
  return true;
}

export function startCommandSync(client: Client, intervalMs = 30 * 60 * 1000) {
  setInterval(() => {
    registerCommands(client).then((changed) => {
      if (changed) console.log("Command list changed; re-registered for all guilds.");
    }).catch((err) => console.error("Auto command sync failed:", err));
  }, intervalMs);
}

export { commands as commandRegistry };