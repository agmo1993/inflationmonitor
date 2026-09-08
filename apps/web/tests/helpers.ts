import type { AuthSession } from "../lib/auth/session";
import type { OpenRouterClient, OpenRouterChatResponse } from "../lib/openrouter/client";
import { createMemoryUsageStore, type UsageStore } from "../lib/metering/usage-store";

export function authOk(accountId = "acct_test_1"): () => Promise<AuthSession> {
  return async () => ({ authenticated: true, accountId });
}

export function authNone(
  reason: "unauthenticated" | "invalid_session" = "unauthenticated",
): () => Promise<AuthSession> {
  return async () => ({ authenticated: false, reason });
}

export function mockOpenRouter(
  impl?: (calls: number) => OpenRouterChatResponse,
): OpenRouterClient & { calls: number } {
  const client = {
    calls: 0,
    async chat() {
      client.calls += 1;
      if (impl) return impl(client.calls);
      return {
        ok: true as const,
        content: "hello from mock",
        costUsd: 0.25,
        generationId: `gen-${client.calls}`,
      };
    },
  };
  return client;
}

export function freshStore(): UsageStore {
  return createMemoryUsageStore();
}

export function utcDate(iso: string): Date {
  return new Date(iso);
}
