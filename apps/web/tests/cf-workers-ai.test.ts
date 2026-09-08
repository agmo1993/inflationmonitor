import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleChatRequest } from "../lib/chat/handler";
import { authOk, freshStore, instrumentedStore } from "./helpers";
import {
  expectNoOpenRouterLeak,
  mockWorkersAi,
} from "./helpers-cf";

/**
 * QA E1–E2 — Cloudflare Workers AI as chat LLM (RED until App migrates).
 *
 * App branch: feat/cf-workers-ai-gen-ui
 * Module: lib/cloudflare/client.ts → getWorkersAiClient
 * Env: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
 * Missing creds → exactly LLM_NOT_CONFIGURED (non-401); no OpenRouter strings.
 */

const CF_ENV_KEYS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "OPENROUTER_API_KEY",
  "AUTH_DEV_BYPASS",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
] as const;

type EnvKey = (typeof CF_ENV_KEYS)[number];
let envSnapshot: Partial<Record<EnvKey, string | undefined>>;

function snapshotEnv() {
  envSnapshot = {};
  for (const key of CF_ENV_KEYS) {
    envSnapshot[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of CF_ENV_KEYS) {
    const value = envSnapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearCfCreds() {
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
}

function clearOpenRouter() {
  delete process.env.OPENROUTER_API_KEY;
}

async function loadWorkersAiModule(): Promise<{
  getWorkersAiClient: () => unknown;
  hasCloudflareChatEnv?: () => boolean;
}> {
  try {
    return (await import("../lib/cloudflare/client")) as {
      getWorkersAiClient: () => unknown;
      hasCloudflareChatEnv?: () => boolean;
    };
  } catch {
    expect.fail(
      "App must add apps/web/lib/cloudflare/client.ts exporting getWorkersAiClient (Workers AI). OpenRouter must not be required for chat.",
    );
  }
}

beforeEach(() => {
  snapshotEnv();
});

afterEach(() => {
  restoreEnv();
});

describe("QA E1 — Cloudflare Workers AI chat LLM", () => {
  it("E1a: cloudflare client module exists (Workers AI contract)", async () => {
    const mod = await loadWorkersAiModule();
    expect(typeof mod.getWorkersAiClient).toBe("function");
  });

  it("E1b: chat handler deps accept llm (OpenRouter not required)", async () => {
    await loadWorkersAiModule();

    const llm = mockWorkersAi();
    const result = await handleChatRequest(
      { message: "cf path" },
      {
        auth: authOk("acct_e1b"),
        usageStore: freshStore(),
        llm,
      } as Parameters<typeof handleChatRequest>[1] & {
        llm: ReturnType<typeof mockWorkersAi>;
      },
    );

    expect(result.status).toBe(200);
    expect(llm.calls).toBe(1);
    expect((result as { llmCalled?: boolean }).llmCalled).toBe(true);
  });

  it("E1c: OPENROUTER_API_KEY absent does not block chat when Workers AI llm injected", async () => {
    clearOpenRouter();
    await loadWorkersAiModule();

    const llm = mockWorkersAi(() => ({
      ok: true,
      content: "cf ok without openrouter",
      costUsd: 0.01,
      generationId: "cf-e1c",
    }));

    const result = await handleChatRequest(
      { message: "no openrouter needed" },
      {
        auth: authOk("acct_e1c"),
        usageStore: freshStore(),
        llm,
      } as Parameters<typeof handleChatRequest>[1] & {
        llm: ReturnType<typeof mockWorkersAi>;
      },
    );

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(llm.calls).toBe(1);
  });
});

describe("QA E2 — missing CF creds + AUTH_DEV_BYPASS", () => {
  it("E2a: missing CLOUDFLARE_ACCOUNT_ID/API_TOKEN → LLM_NOT_CONFIGURED (not 401); no OpenRouter strings", async () => {
    clearCfCreds();
    clearOpenRouter();

    const store = instrumentedStore();
    const result = await handleChatRequest(
      { message: "need workers ai" },
      { auth: authOk("acct_e2a"), usageStore: store },
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

  it("E2b: AUTH_DEV_BYPASS still works with CF missing-cred path (not 401)", async () => {
    process.env.AUTH_DEV_BYPASS = "1";
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    clearCfCreds();
    clearOpenRouter();

    const store = instrumentedStore();
    const result = await handleChatRequest(
      { message: "bypass + missing cf" },
      { usageStore: store },
    );

    expect(result.status).not.toBe(401);
    expect([500, 503]).toContain(result.status);
    expect(result.body).toMatchObject({
      ok: false,
      code: "LLM_NOT_CONFIGURED",
    });
    expectNoOpenRouterLeak(result.body);
    expect(store.incrementSpendCalls).toBe(0);
  });
});
