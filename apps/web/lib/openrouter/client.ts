/**
 * OpenRouter-only LLM gateway. No other providers.
 */

export interface OpenRouterChatRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
}

export interface OpenRouterChatResult {
  ok: true;
  content: string;
  /** Estimated cost in USD for metering (from usage or a fixed stub estimate). */
  costUsd: number;
  /** Stable id suitable as an idempotency key for spend increments. */
  generationId: string;
}

export interface OpenRouterChatFailure {
  ok: false;
  error: string;
  status?: number;
}

export type OpenRouterChatResponse = OpenRouterChatResult | OpenRouterChatFailure;

export type OpenRouterClient = {
  chat: (req: OpenRouterChatRequest) => Promise<OpenRouterChatResponse>;
};

const DEFAULT_MODEL = "openai/gpt-4o-mini";

/** Minimal cost estimate when OpenRouter omits native cost fields. */
const FALLBACK_COST_USD = 0.01;

let clientOverride: OpenRouterClient | null = null;

export function setOpenRouterClientForTests(client: OpenRouterClient | null) {
  clientOverride = client;
}

export function getOpenRouterClient(): OpenRouterClient {
  if (clientOverride) return clientOverride;
  return createLiveOpenRouterClient();
}

function createLiveOpenRouterClient(): OpenRouterClient {
  return {
    async chat(req) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return { ok: false, error: "OPENROUTER_API_KEY is not set", status: 500 };
      }

      const model =
        req.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_APP_URL ?? "https://inflationmonitor.app",
          "X-Title": "InflationMonitor",
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          error: `OpenRouter error ${res.status}: ${body.slice(0, 400)}`,
          status: res.status,
        };
      }

      const data = (await res.json()) as {
        id?: string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_cost?: number; cost?: number };
      };

      const content = data.choices?.[0]?.message?.content ?? "";
      const costUsd =
        typeof data.usage?.total_cost === "number"
          ? data.usage.total_cost
          : typeof data.usage?.cost === "number"
            ? data.usage.cost
            : FALLBACK_COST_USD;

      return {
        ok: true,
        content,
        costUsd,
        generationId: data.id ?? `or-${Date.now()}`,
      };
    },
  };
}
