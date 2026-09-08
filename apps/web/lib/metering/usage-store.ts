/**
 * Usage store for per-account monthly OpenRouter spend.
 *
 * Idempotency: `incrementSpend` accepts an optional `idempotencyKey`. When
 * provided, a second call with the same key must NOT increase spend again
 * (successful LLM usage is billed once; retries are safe).
 *
 * Failed / quota-blocked attempts must never call `incrementSpend`.
 */

export interface UsageStore {
  getSpend(accountId: string, yearMonth: string): Promise<number>;
  /**
   * Atomically add `amountUsd` to the account's month spend.
   * Returns the new total. Duplicate `idempotencyKey` → no-op, returns current total.
   */
  incrementSpend(
    accountId: string,
    yearMonth: string,
    amountUsd: number,
    idempotencyKey?: string,
  ): Promise<number>;
}

/** In-memory store for tests and local dev without DATABASE_URL. */
export function createMemoryUsageStore(): UsageStore {
  const spend = new Map<string, number>();
  const seen = new Set<string>();

  const key = (accountId: string, yearMonth: string) =>
    `${accountId}::${yearMonth}`;

  return {
    async getSpend(accountId, yearMonth) {
      return spend.get(key(accountId, yearMonth)) ?? 0;
    },
    async incrementSpend(accountId, yearMonth, amountUsd, idempotencyKey) {
      if (idempotencyKey) {
        if (seen.has(idempotencyKey)) {
          return spend.get(key(accountId, yearMonth)) ?? 0;
        }
        seen.add(idempotencyKey);
      }
      const k = key(accountId, yearMonth);
      const next = (spend.get(k) ?? 0) + amountUsd;
      spend.set(k, next);
      return next;
    },
  };
}
