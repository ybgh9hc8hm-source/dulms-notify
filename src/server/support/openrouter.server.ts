/**
 * OpenRouter chat completions — free models only.
 *
 * Free tiers are rate limited and occasionally unavailable, so we walk the
 * list in order and use the first model that answers.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Per-model attempt budget; the whole chain still has to fit a webhook. */
const REQUEST_TIMEOUT_MS = 12_000;
/** Hard ceiling for walking the whole fallback chain. */
const CHAIN_BUDGET_MS = 45_000;

/** Free models, best-first (verified available on the free tier). */
export const FREE_MODELS = [
  // Strongest free models first: 550B and 1M-context class.
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "openrouter/free",
] as const;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = { ok: true; reply: string; model: string } | { ok: false; error: string };

export type ChatOptions = {
  /** "auto" (or omitted) walks the free-model chain, else the model is pinned first. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export async function chatComplete(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const { hydrateSecrets, secret } = await import("@/server/vault.server");
  await hydrateSecrets();
  const key = secret("OPENROUTER_API_KEY");
  if (!key) return { ok: false, error: "OPENROUTER_API_KEY غير مضبوط" };

  let lastError = "تعذّر الوصول إلى نماذج الذكاء الاصطناعي";

  const pinned = options.model && options.model !== "auto" ? options.model : null;
  const chain = pinned
    ? [pinned, ...FREE_MODELS.filter((item) => item !== pinned)]
    : [...FREE_MODELS];

  const deadline = Date.now() + CHAIN_BUDGET_MS;

  for (const model of chain) {
    if (Date.now() > deadline) break;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        // Free-tier models sometimes hang; the Telegram webhook waits on this
        // call, so cap each attempt and fall through to the next model.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "DULMS Notify Support",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2500,
          // Let reasoning-capable models think (low effort) for a smarter
          // answer; the reply sanitizer strips any leaked scratchpad.
          reasoning: { effort: "low" },
        }),
      });

      const body = (await res.json().catch(() => null)) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        lastError = body?.error?.message ?? `OpenRouter error ${res.status}`;
        console.error("[support] model failed", { model, status: res.status, error: lastError });
        continue;
      }

      const reply = body?.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        lastError = "رد فارغ من النموذج";
        continue;
      }
      return { ok: true, reply, model };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error("[support] model threw", { model, error: lastError });
    }
  }

  return { ok: false, error: lastError };
}
