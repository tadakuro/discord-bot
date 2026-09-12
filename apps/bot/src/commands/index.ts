import { Collection, REST, Routes, type ChatInputCommandInteraction, type Client } from "discord.js";
import { moderationCommands } from "./moderation.js";
import { moderationExtraCommands } from "./moderationExtras.js";
import { levelingCommands } from "./leveling.js";
import { reactionRoleCommands } from "./reactionrole.js";
import { welcomeCommands } from "./welcome.js";
import { configCommands } from "./config.js";
import { automodCommands } from "./automod.js";
import { antispamCommands } from "./antispam.js";
import { utilityCommands } from "./utility.js";

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
register(utilityCommands, "Utility");

export async function registerCommands(client: Client) {
  if (!client.user) return;
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
  const payload = commands.map((c) => c.data.toJSON());
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: payload });
    console.log(`Registered ${payload.length} slash commands.`);
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
}

export { commands as commandRegistry };