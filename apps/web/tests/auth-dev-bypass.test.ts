import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAuthSession, setAuthResolver } from "../lib/auth/session";
import { handleChatRequest } from "../lib/chat/handler";
import { utcYearMonth } from "../lib/metering/period";
import { freshStore, instrumentedStore, mockOpenRouter } from "./helpers";
import { expectNoOpenRouterLeak } from "./helpers-cf";

/**
 * QA D — AUTH_DEV_BYPASS acceptance (RED until App implements).
 *
 * App contract:
 * - Fixed account_id: exactly `dev_bypass_user`
 * - Shared gate module `lib/auth/dev-bypass.ts` exporting:
 *     DEV_BYPASS_ACCOUNT_ID, isAuthDevBypassActive()
 *   Middleware and resolveAuthSession must both honor that gate.
 * - Env: AUTH_DEV_BYPASS, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,
 *   NODE_ENV, VERCEL, VERCEL_ENV, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 *
 * E6 / D5 migration: missing-LLM path asserts Cloudflare Workers AI creds
 * (LLM_NOT_CONFIGURED, no OpenRouter strings). D1–D4/D6 still inject openRouter
 * mocks until App lands feat/cf-workers-ai-gen-ui — then switch those to CF mocks.
 */

const EXPECTED_BYPASS_ACCOUNT_ID = "dev_bypass_user";

const CLERK_PK = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY";
const CLERK_SK = "CLERK_SECRET_KEY";

const ENV_KEYS = [
  "AUTH_DEV_BYPASS",
  CLERK_PK,
  CLERK_SK,
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "OPENROUTER_API_KEY",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];
type EnvSnapshot = Partial<Record<EnvKey, string | undefined>>;

let envSnapshot: EnvSnapshot;

function snapshotEnv() {
  envSnapshot = {};
  for (const key of ENV_KEYS) {
    envSnapshot[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = envSnapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearClerkKeys() {
  delete process.env[CLERK_PK];
  delete process.env[CLERK_SK];
}

function clearHostingFlags() {
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
}

/** Env where bypass MUST be active once App implements it. */
function enableBypassEligibleEnv(overrides: Record<string, string | undefined> = {}) {
  process.env.AUTH_DEV_BYPASS = "1";
  process.env.NODE_ENV = "development";
  clearClerkKeys();
  clearHostingFlags();
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

async function loadDevBypassModule(): Promise<{
  DEV_BYPASS_ACCOUNT_ID: string;
  isAuthDevBypassActive: () => boolean;
}> {
  try {
    return (await import("../lib/auth/dev-bypass")) as {
      DEV_BYPASS_ACCOUNT_ID: string;
      isAuthDevBypassActive: () => boolean;
    };
  } catch {
    expect.fail(
      "App must add apps/web/lib/auth/dev-bypass.ts exporting DEV_BYPASS_ACCOUNT_ID and isAuthDevBypassActive() for middleware + session",
    );
  }
}

function expectNotBypassUser(
  session: Awaited<ReturnType<typeof resolveAuthSession>>,
) {
  if (session.authenticated) {
    expect(session.accountId).not.toBe(EXPECTED_BYPASS_ACCOUNT_ID);
  } else {
    expect(session.authenticated).toBe(false);
  }
}

beforeEach(() => {
  snapshotEnv();
  setAuthResolver(null);
});

afterEach(() => {
  setAuthResolver(null);
  restoreEnv();
});

describe("QA D — AUTH_DEV_BYPASS", () => {
  it("D1: AUTH_DEV_BYPASS=1 + empty Clerk + NODE_ENV=development → authenticated as dev_bypass_user (session + /api/chat)", async () => {
    enableBypassEligibleEnv();

    const gate = await loadDevBypassModule();
    expect(gate.DEV_BYPASS_ACCOUNT_ID).toBe(EXPECTED_BYPASS_ACCOUNT_ID);
    expect(gate.isAuthDevBypassActive()).toBe(true);

    const session = await resolveAuthSession();
    expect(session).toEqual({
      authenticated: true,
      accountId: EXPECTED_BYPASS_ACCOUNT_ID,
    });

    const store = freshStore();
    const llm = mockOpenRouter();
    const now = () => new Date("2026-09-08T00:00:00Z");
    const result = await handleChatRequest(
      { message: "bypass chat" },
      // No auth override — must use resolveAuthSession bypass.
      { usageStore: store, openRouter: llm, now },
    );

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(llm.calls).toBe(1);
    expect(result.openRouterCalled).toBe(true);
    expect(
      await store.getSpend(EXPECTED_BYPASS_ACCOUNT_ID, utcYearMonth(now())),
    ).toBeGreaterThan(0);
  });

  it("D1b: empty-string Clerk keys count as missing (bypass still on)", async () => {
    enableBypassEligibleEnv({
      [CLERK_PK]: "",
      [CLERK_SK]: "",
    });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(true);

    const session = await resolveAuthSession();
    expect(session).toEqual({
      authenticated: true,
      accountId: EXPECTED_BYPASS_ACCOUNT_ID,
    });
  });

  it("D1c: chat handler attributes spend to fixed bypass account_id", async () => {
    enableBypassEligibleEnv();

    let seenAccount: string | undefined;
    const store = {
      async getSpend(accountId: string) {
        seenAccount = accountId;
        return 0;
      },
      async incrementSpend(accountId: string, _ym: string, amount: number) {
        seenAccount = accountId;
        return amount;
      },
    };

    const result = await handleChatRequest(
      { message: "ping" },
      {
        usageStore: store,
        openRouter: {
          async chat() {
            return {
              ok: true as const,
              content: "ok",
              costUsd: 0.01,
              generationId: "gen-bypass",
            };
          },
        },
      },
    );

    expect(result.status).toBe(200);
    expect(seenAccount).toBe(EXPECTED_BYPASS_ACCOUNT_ID);
  });

  it("D2: AUTH_DEV_BYPASS=1 + real Clerk keys → bypass ignored; unauthenticated still 401", async () => {
    enableBypassEligibleEnv({
      [CLERK_PK]: "pk_test_not_empty_clerk_key",
      [CLERK_SK]: "sk_test_not_empty_clerk_key",
    });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    // Either key alone also disables bypass
    enableBypassEligibleEnv({ [CLERK_PK]: "pk_only" });
    expect(gate.isAuthDevBypassActive()).toBe(false);
    enableBypassEligibleEnv({ [CLERK_SK]: "sk_only" });
    expect(gate.isAuthDevBypassActive()).toBe(false);

    enableBypassEligibleEnv({
      [CLERK_PK]: "pk_test_not_empty_clerk_key",
      [CLERK_SK]: "sk_test_not_empty_clerk_key",
    });
    const session = await resolveAuthSession();
    expectNotBypassUser(session);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "should 401 without clerk session" },
      { usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(llm.calls).toBe(0);
    expect(result.openRouterCalled).toBe(false);
  });

  it("D3: AUTH_DEV_BYPASS=1 + no Clerk keys + NODE_ENV=production → bypass OFF", async () => {
    enableBypassEligibleEnv({ NODE_ENV: "production" });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    const session = await resolveAuthSession();
    expectNotBypassUser(session);
    expect(session.authenticated).toBe(false);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "prod must not bypass" },
      { usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(llm.calls).toBe(0);
  });

  it("D4a: AUTH_DEV_BYPASS=1 + VERCEL=1 → bypass OFF even if NODE_ENV=development", async () => {
    enableBypassEligibleEnv({ VERCEL: "1" });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    const session = await resolveAuthSession();
    expectNotBypassUser(session);
    expect(session.authenticated).toBe(false);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "vercel hosting" },
      { usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(llm.calls).toBe(0);
  });

  it("D4b: AUTH_DEV_BYPASS=1 + VERCEL_ENV=production → bypass OFF even if NODE_ENV=development", async () => {
    enableBypassEligibleEnv({ VERCEL_ENV: "production" });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    const session = await resolveAuthSession();
    expectNotBypassUser(session);
    expect(session.authenticated).toBe(false);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "vercel_env production" },
      { usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(llm.calls).toBe(0);
  });

  it("D5: bypass active + missing CF creds → NOT 401; LLM_NOT_CONFIGURED (503/500); no OpenRouter strings", async () => {
    // E6 migration: D5 now targets Cloudflare Workers AI missing-cred path.
    // RED on main until App ships feat/cf-workers-ai-gen-ui (was OpenRouter).
    enableBypassEligibleEnv();
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.OPENROUTER_API_KEY;

    const store = instrumentedStore();
    // No auth / LLM inject — real bypass session + live missing-CF-creds path.
    const result = await handleChatRequest(
      { message: "need cloudflare workers ai" },
      { usageStore: store },
    );

    expect(result.status).not.toBe(401);
    expect([500, 503]).toContain(result.status);
    expect(result.body).toMatchObject({
      ok: false,
      code: "LLM_NOT_CONFIGURED",
    });
    expectNoOpenRouterLeak(result.body);
    if (!result.body.ok) {
      expect(result.body.error.toLowerCase()).toMatch(
        /cloudflare|workers\s*ai|account_id|api_token|not configured/i,
      );
    }
    expect(result.spendIncremented).toBe(false);
    expect(store.incrementSpendCalls).toBe(0);
  });

  it("D6a: AUTH_DEV_BYPASS unset → no bypass", async () => {
    enableBypassEligibleEnv();
    delete process.env.AUTH_DEV_BYPASS;

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    const session = await resolveAuthSession();
    expectNotBypassUser(session);
    expect(session.authenticated).toBe(false);
  });

  it("D6b: AUTH_DEV_BYPASS=0 → no bypass", async () => {
    enableBypassEligibleEnv({ AUTH_DEV_BYPASS: "0" });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    const session = await resolveAuthSession();
    expectNotBypassUser(session);
    expect(session.authenticated).toBe(false);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "bypass off" },
      { usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(llm.calls).toBe(0);
  });

  it("D6c: AUTH_DEV_BYPASS empty string → no bypass", async () => {
    enableBypassEligibleEnv({ AUTH_DEV_BYPASS: "" });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);
  });
});
