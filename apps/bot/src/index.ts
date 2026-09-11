import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { registerCommands } from "./commands/index.js";
import { registerEvents } from "./events/index.js";
import { startHeartbeat } from "./lib/heartbeat.js";
import { startDbKeepAlive } from "./lib/dbKeepAlive.js";

loadEnv({ path: [join(dirname(fileURLToPath(import.meta.url)), "../../../.env"), ".env"] });

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction],
});

registerEvents(client);

client.once("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  await registerCommands(client);
});

await client.login(token);
console.log("Bot process running. Press Ctrl+C to stop.");
startHeartbeat();
startDbKeepAlive();