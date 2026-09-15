import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { C } from "../lib/embeds.js";
import { aiEnabled, askAi, AI_MODEL } from "../lib/ai.js";
import type { BotCommand } from "./index.js";

const SYSTEM_PROMPT =
  "You are Astalon, a friendly assistant in a Discord server. Answer clearly and concisely using markdown that Discord embeds support (**bold**, *italic*, links, code blocks, lists). Avoid walls of text; use short sections when helpful.";
const MAX_EMBED = 4000;

function truncate(s: string, max = MAX_EMBED): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export const aiCommands: BotCommand[] = [
  {
    data: new SlashCommandBuilder()
      .setName("ai")
      .setDescription("Ask a question to an AI model (Ollama Cloud)")
      .addSubcommand((s) =>
        s
          .setName("ask")
          .setDescription("Get an answer from the AI")
          .addStringOption((o) =>
            o.setName("prompt").setDescription("What you want to ask").setRequired(true).setMaxLength(3500)
          )
      ),
    async execute(interaction: ChatInputCommandInteraction) {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
      if (!aiEnabled()) {
        const embed = new EmbedBuilder()
          .setColor(C.error)
          .setTitle("AI is not configured")
          .setDescription("This bot has no `OLLAMA_API_KEY` set. A server admin needs to add it to the environment before `/ai ask` works.");
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      const prompt = interaction.options.getString("prompt", true);
      const start = Date.now();
      try {
        const result = await askAi(prompt, { system: SYSTEM_PROMPT, timeoutMs: 120_000 });
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const embed = new EmbedBuilder()
          .setColor(C.ai)
          .setAuthor({ name: `${interaction.user.username} asked` })
          .setTitle("AI response")
          .setDescription(truncate(result.content))
          .setFooter({ text: `Astalon · ${result.model} · ${elapsed}s` });
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        const embed = new EmbedBuilder().setColor(C.error).setTitle("AI error").setDescription(truncate(msg, 1500));
        await interaction.editReply({ embeds: [embed] });
      }
    },
  },
];