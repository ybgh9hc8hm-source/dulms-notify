/**
 * Managed AI gateway provider (server only).
 *
 * The support assistant runs on the gateway's Responses API, which is the
 * fast, reliable path — the old free OpenRouter chain is only a fallback.
 */
import { createOpenAI } from "@ai-sdk/openai";

const BASE_URL = "https://ai.gateway.lovable.dev/v1";
const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

/** Resends a known run id and captures the one the gateway mints. */
function runIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  return {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(RUN_ID_HEADER)) headers.set(RUN_ID_HEADER, runId);
      const response = await fetch(input, { ...init, headers });
      runId = response.headers.get(RUN_ID_HEADER)?.trim() || runId;
      return response;
    }) as typeof fetch,
    getRunId: () => runId,
  };
}

export function gatewayApiKey(): string | null {
  return process.env["LOVABLE_API_KEY"]?.trim() || null;
}

/** Responses-API model factory. Create it inside the request, never at module scope. */
export function createGatewayProvider(apiKey: string, initialRunId?: string) {
  const wrapper = runIdFetch(initialRunId);
  const provider = createOpenAI({
    baseURL: BASE_URL,
    apiKey,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: wrapper.fetch,
  });
  return Object.assign(provider, { getRunId: wrapper.getRunId });
}
