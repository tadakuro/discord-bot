const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "https://ollama.com";
export const AI_MODEL = process.env.AI_MODEL ?? "nemotron-3-super:cloud";

export type AiAskOptions = {
  system?: string;
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
};

export type AiResult = {
  content: string;
  model: string;
  doneReason?: string;
};

export function aiEnabled(): boolean {
  return !!process.env.OLLAMA_API_KEY;
}

export async function askAi(prompt: string, opts: AiAskOptions = {}): Promise<AiResult> {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) throw new Error("OLLAMA_API_KEY is not configured. Ask a server admin to set it.");

  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });

  const timeout = opts.timeoutMs ?? 90_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        stream: false,
        options: { temperature: opts.temperature ?? 0.7, num_predict: opts.numPredict ?? 4096 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama API error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      error?: string;
      model?: string;
      done_reason?: string;
      message?: { content?: string; reasoning?: string; thinking?: string };
    };
    if (data.error) throw new Error(String(data.error));
    let content = (data.message?.content ?? "").trim();
    const reasoning = (data.message?.reasoning ?? data.message?.thinking ?? "").trim();
    if (!content && reasoning) content = reasoning;
    if (!content) throw new Error("The model returned an empty response.");
    return { content, model: data.model ?? AI_MODEL, doneReason: data.done_reason };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`The model took too long to answer (${(timeout / 1000).toFixed(0)}s). Try a shorter question, ${AI_MODEL} is a big model.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}