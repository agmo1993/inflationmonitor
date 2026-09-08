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

/** Wrap a UsageStore with call counters for asserting auth/quota side effects. */
export function instrumentedStore(inner: UsageStore = createMemoryUsageStore()): UsageStore & {
  getSpendCalls: number;
  incrementSpendCalls: number;
} {
  const wrapped = {
    getSpendCalls: 0,
    incrementSpendCalls: 0,
    async getSpend(accountId: string, yearMonth: string) {
      wrapped.getSpendCalls += 1;
      return inner.getSpend(accountId, yearMonth);
    },
    async incrementSpend(
      accountId: string,
      yearMonth: string,
      amountUsd: number,
      idempotencyKey?: string,
    ) {
      wrapped.incrementSpendCalls += 1;
      return inner.incrementSpend(accountId, yearMonth, amountUsd, idempotencyKey);
    },
  };
  return wrapped;
}

export function utcDate(iso: string): Date {
  return new Date(iso);
}
