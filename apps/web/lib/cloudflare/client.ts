/**
 * Cloudflare Workers AI REST client for InflationMonitor chat.
 * Server-only — uses CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
 *
 * API shape inspired by AusCPI's Workers AI gateway (env names / run URL);
 * this module is independent — do not import from aus-cpi.
 */

import {
  createDefaultCostEstimator,
  extractUsageFromCfBody,
  type CostEstimator,
} from "./cost";
import {
  getChatModel,
  getCloudflareAccountId,
  getCloudflareApiToken,
  hasCloudflareChatEnv,
} from "./env";

export interface WorkersAiChatRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
}

export interface WorkersAiChatResult {
  ok: true;
  content: string;
  /** Estimated or native cost in USD for metering. */
  costUsd: number;
  /** Stable id suitable as an idempotency key for spend increments. */
  generationId: string;
  raw?: unknown;
}

export interface WorkersAiChatFailure {
  ok: false;
  error: string;
  status?: number;
  /** Missing CF creds / chat config — maps to LLM_NOT_CONFIGURED. */
  notConfigured?: boolean;
}

export type WorkersAiChatResponse = WorkersAiChatResult | WorkersAiChatFailure;

export type WorkersAiClient = {
  chat: (req: WorkersAiChatRequest) => Promise<WorkersAiChatResponse>;
};

let clientOverride: WorkersAiClient | null = null;
let costEstimatorOverride: CostEstimator | null = null;

export function setWorkersAiClientForTests(client: WorkersAiClient | null) {
  clientOverride = client;
}

export function setCostEstimatorForTests(estimator: CostEstimator | null) {
  costEstimatorOverride = estimator;
}

export function getWorkersAiClient(): WorkersAiClient {
  if (clientOverride) return clientOverride;
  return createLiveWorkersAiClient();
}

export function getCostEstimator(): CostEstimator {
  return costEstimatorOverride ?? createDefaultCostEstimator();
}

function createLiveWorkersAiClient(): WorkersAiClient {
  return {
    async chat(req) {
      if (!hasCloudflareChatEnv()) {
        return {
          ok: false,
          notConfigured: true,
          status: 503,
          error:
            "Cloudflare Workers AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
        };
      }

      const accountId = getCloudflareAccountId()!;
      const token = getCloudflareApiToken()!;
      const model = req.model ?? getChatModel();
      // Model ids contain @ and /; Cloudflare expects them unencoded in the path.
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages: req.messages }),
        });
      } catch (err) {
        return {
          ok: false,
          status: 502,
          error: `Could not reach Cloudflare Workers AI: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }

      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }

      if (!res.ok) {
        const detail = extractErrorDetail(body, text, res.statusText);
        return {
          ok: false,
          status: res.status,
          error: `Workers AI error ${res.status}: ${detail.slice(0, 400)}`,
        };
      }

      const content = extractContent(body);
      const { nativeCostUsd, usage } = extractUsageFromCfBody(body);
      const costUsd = getCostEstimator().estimate({
        nativeCostUsd,
        usage,
        model,
      });
      const generationId = extractGenerationId(body) ?? `cf-${Date.now()}`;

      return {
        ok: true,
        content,
        costUsd,
        generationId,
        raw: body,
      };
    },
  };
}

function extractErrorDetail(
  body: unknown,
  text: string,
  statusText: string,
): string {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.errors) && obj.errors[0]) {
      const first = obj.errors[0] as { message?: string };
      if (first.message) return first.message;
      return JSON.stringify(obj.errors);
    }
    if (typeof obj.error === "string") return obj.error;
  }
  return text.slice(0, 400) || statusText;
}

function extractContent(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const root = body as Record<string, unknown>;
  const result =
    root.result && typeof root.result === "object" && !Array.isArray(root.result)
      ? (root.result as Record<string, unknown>)
      : root;

  // OpenAI chat.completion shape
  const choices = result.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const message = (choices[0] as { message?: { content?: unknown } }).message;
    if (message && typeof message.content === "string") return message.content;
  }

  if (typeof result.response === "string") return result.response;
  if (typeof result.text === "string") return result.text;
  if (typeof result.result === "string") return result.result;
  return "";
}

function extractGenerationId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const root = body as Record<string, unknown>;
  if (typeof root.id === "string" && root.id.trim()) return root.id.trim();
  const result =
    root.result && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : null;
  if (result && typeof result.id === "string" && result.id.trim()) {
    return result.id.trim();
  }
  return undefined;
}

export { hasCloudflareChatEnv, getChatModel, DEFAULT_CHAT_MODEL } from "./env";
