import { EmbedBuilder } from "discord.js";
import { commandRegistry } from "../apps/bot/src/commands/index.js";
import { C } from "../apps/bot/src/lib/embeds.js";

const CATEGORY_ORDER = ["Moderation", "Auto-mod", "Anti-spam", "Leveling", "Welcome", "Reaction Roles", "Configuration", "AI", "Utility"];

type OptJson = { type?: number; name?: string; description?: string; options?: OptJson[] };

function summarize(data: unknown): string[] {
  const json = data as { options?: OptJson[] };
  const out: string[] = [];
  for (const opt of json?.options ?? []) {
    if (opt.type === 1 && opt.name) out.push(opt.name);
    else if (opt.type === 2 && opt.name)
      for (const sub of opt.options ?? []) if (sub.name) out.push(`${opt.name}:${sub.name}`);
  }
  return out;
}

const grouped = new Map<string, string[]>();
for (const cmd of commandRegistry.values()) {
  const desc = (cmd.data as { description?: string }).description ?? "";
  const subs = summarize(cmd.data.toJSON() as { options?: unknown });
  const line = subs.length
    ? `\`/${cmd.data.name}\` — ${desc}\n  _subcommands: \`${subs.join("` · `")}\`_`
    : `\`/${cmd.data.name}\` — ${desc}`;
  const cat = cmd.category ?? "Other";
  if (!grouped.has(cat)) grouped.set(cat, []);
  grouped.get(cat)!.push(line);
}
const embed = new EmbedBuilder()
  .setColor(C.info)
  .setTitle("Help — All commands")
  .setDescription(
    "The bot covers every common MEE6 / Carl-bot feature. Per-server modules are configured with Manage Guild / Manage Roles / Moderate Members permissions.\n\nUse **`/settings`** for a server-wide overview."
  )
  .setFooter({ text: `Astalon · ${commandRegistry.size} commands` });
for (const cat of CATEGORY_ORDER.filter((c) => grouped.has(c))) {
  embed.addFields({ name: `**${cat}**`, value: grouped.get(cat)!.join("\n"), inline: false });
}
const json = embed.toJSON();
let total = 0;
for (const f of json.fields ?? []) {
  total += f.name.length + f.value.length;
  console.log(`FIELD ${f.name.replace(/\*\*/g, "")} len=${f.value.length}`);
}
console.log("fields:", (json.fields ?? []).length, "totalCh:", total + (json.description?.length ?? 0), "commands:", commandRegistry.size);
console.log("--- Moderation sample:", (json.fields?.[0].value ?? "").split("\n")[0]);