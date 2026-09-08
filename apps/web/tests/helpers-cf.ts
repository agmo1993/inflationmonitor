import { expect } from "vitest";

/**
 * Cloudflare Workers AI test helpers (CoS E1–E3 / E6).
 *
 * App contract (feat/cf-workers-ai-gen-ui):
 * - Module: apps/web/lib/cloudflare/client.ts
 * - Env: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (OpenRouter not required)
 * - Handler deps: prefer `llm` (WorkersAiClient); `openRouter` may remain as alias
 * - Result flags: `llmCalled` (and optionally legacy `openRouterCalled`)
 * - Missing creds → code exactly `LLM_NOT_CONFIGURED` (non-401); body/error must NOT
 *   contain "OpenRouter" / "OPENROUTER" strings
 *
 * NOTE for App: legacy suites still inject `openRouter` via tests/helpers.ts.
 * After CF migration keep that alias OR switch mocks to `llm` + mockWorkersAi.
 * D5 already asserts the CF missing-cred path (E6).
 */

export interface WorkersAiChatRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
}

export interface WorkersAiChatSuccess {
  ok: true;
  content: string;
  costUsd: number;
  generationId: string;
}

export interface WorkersAiChatFailure {
  ok: false;
  error: string;
  status?: number;
  notConfigured?: boolean;
}

export type WorkersAiChatResponse =
  | WorkersAiChatSuccess
  | WorkersAiChatFailure;

export type WorkersAiClient = {
  chat: (req: WorkersAiChatRequest) => Promise<WorkersAiChatResponse>;
};

/** Preferred mock name for CF Workers AI. */
export function mockWorkersAi(
  impl?: (calls: number) => WorkersAiChatResponse,
): WorkersAiClient & { calls: number } {
  const client = {
    calls: 0,
    async chat() {
      client.calls += 1;
      if (impl) return impl(client.calls);
      return {
        ok: true as const,
        content: "hello from workers ai mock",
        costUsd: 0.25,
        generationId: `cf-gen-${client.calls}`,
      };
    },
  };
  return client;
}

/** @deprecated alias — prefer mockWorkersAi */
export const mockCloudflareAi = mockWorkersAi;

/** Assert serialized chat error path has no OpenRouter leakage. */
export function expectNoOpenRouterLeak(value: unknown) {
  const blob = JSON.stringify(value);
  expect(blob).not.toMatch(/OpenRouter/i);
  expect(blob).not.toMatch(/OPENROUTER/);
}
