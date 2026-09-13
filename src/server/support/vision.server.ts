/**
 * Vision agent: reads the characters of a DULMS CAPTCHA image.
 *
 * Uses the same OpenRouter key as the support assistant, but a separate
 * chain of vision-capable models. Every answer is normalised and only kept
 * when it looks like a plausible CAPTCHA string.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 20_000;

/** Vision-capable models, best-first. Free tiers first, then cheap paid. */
export const VISION_MODELS = [
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.0-flash-001",
  "openai/gpt-4o-mini",
  "qwen/qwen2.5-vl-72b-instruct:free",
] as const;

const PROMPT =
  "This is a CAPTCHA image from a university portal. Reply with ONLY the characters you see, " +
  "no spaces, no punctuation, no explanation. If unreadable reply exactly: UNKNOWN";

export type CaptchaSolution =
  { ok: true; text: string; model: string } | { ok: false; error: string };

function normalise(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9]/g, "")
    .trim()
    .slice(0, 10);
}

export function plausibleCaptcha(value: string): boolean {
  return /^[A-Za-z0-9]{4,8}$/.test(value);
}

/** Solves one CAPTCHA image given as a `data:image/...;base64,...` URL. */
export async function solveCaptcha(dataUrl: string): Promise<CaptchaSolution> {
  const { hydrateSecrets, secret } = await import("@/server/vault.server");
  await hydrateSecrets();
  const key = secret("OPENROUTER_API_KEY");
  if (!key) return { ok: false, error: "OPENROUTER_API_KEY is not configured." };

  const pinned = secret("CAPTCHA_VISION_MODEL");
  const chain = pinned
    ? [pinned, ...VISION_MODELS.filter((model) => model !== pinned)]
    : [...VISION_MODELS];

  let lastError = "No vision model could read the CAPTCHA.";
  for (const model of chain) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "DULMS Notify Captcha Agent",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        lastError = body?.error?.message ?? `OpenRouter error ${res.status}`;
        continue;
      }
      const text = normalise(body?.choices?.[0]?.message?.content ?? "");
      if (!plausibleCaptcha(text) || /^unknown$/i.test(text)) {
        lastError = "The vision model could not read the CAPTCHA.";
        continue;
      }
      return { ok: true, text, model };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { ok: false, error: lastError };
}
