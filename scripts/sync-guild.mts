import { REST, Routes } from "discord.js";
import { commandRegistry } from "../apps/bot/src/commands/index.js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env", "/root/dcbot/.env"] });

const token = process.env.DISCORD_TOKEN!;
const clientId = Buffer.from(token.split(".")[0], "base64").toString("utf8");
const guildId = process.argv[2];
if (!guildId) {
  console.error("usage: tsx scripts/sync-guild.mts <guildId>  (call without args to list registered commands)");
  process.exit(1);
}
const rest = new REST({ version: "10" }).setToken(token);
const payload = commandRegistry.map((c) => c.data.toJSON());
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: payload });
console.log(`Registered ${payload.length} commands inline for guild ${guildId}`);