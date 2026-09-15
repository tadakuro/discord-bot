import { EmbedBuilder } from "discord.js";
import { commandRegistry } from "/root/dcbot/apps/bot/src/commands/index.js";
import { C } from "/root/dcbot/apps/bot/src/lib/embeds.js";

const CATEGORY_ORDER = ["Moderation", "Auto-mod", "Anti-spam", "Leveling", "Welcome", "Reaction Roles", "Configuration", "Utility"];
const grouped = new Map<string, string[]>();
for (const cmd of commandRegistry.values()) {
  const cat = cmd.category ?? "Other";
  (grouped.get(cat) ?? grouped.set(cat, []).get(cat)!).push(`\`/${cmd.data.name}\``);
}
const embed = new EmbedBuilder()
  .setColor(C.info)
  .setTitle("Help — Commands")
  .setDescription("All modules are configured per-server via slash commands. Use `/settings` to see what's on.")
  .setFooter({ text: "Astalon" });
const order = [...CATEGORY_ORDER].filter((c) => grouped.has(c));
const rest = [...grouped.keys()].filter((c) => !CATEGORY_ORDER.includes(c));
for (const cat of [...order, ...rest]) embed.addFields({ name: `**${cat}**`, value: grouped.get(cat)!.join(" · "), inline: false });
const json = embed.toJSON();
let total = 0;
for (const f of json.fields ?? []) {
  total += f.name.length + f.value.length;
  console.log(`FIELD ${f.name.replace(/\*\*/g,'')} len=${f.value.length}: ${f.value.slice(0,80)}...`);
}
console.log("fields:", (json.fields ?? []).length, "totalCh:", total + (json.description?.length ?? 0));
