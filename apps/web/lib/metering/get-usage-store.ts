import type { UsageStore } from "./usage-store";
import { createMemoryUsageStore } from "./usage-store";
import { createPostgresUsageStore } from "../db/postgres-usage-store";

let singleton: UsageStore | null = null;
let memoryFallback: UsageStore | null = null;

/**
 * Resolve the process-wide usage store.
 * Uses Postgres when DATABASE_URL is set; otherwise an in-memory store
 * (handy for unit tests and local UI smoke without a DB).
 */
export function getUsageStore(): UsageStore {
  if (singleton) return singleton;
  if (process.env.DATABASE_URL) {
    singleton = createPostgresUsageStore();
    return singleton;
  }
  if (!memoryFallback) memoryFallback = createMemoryUsageStore();
  return memoryFallback;
}

/** Test helper: inject a store (resets singleton). */
export function setUsageStoreForTests(store: UsageStore | null) {
  singleton = store;
  memoryFallback = null;
}
