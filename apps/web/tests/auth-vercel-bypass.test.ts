import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAuthSession, setAuthResolver } from "../lib/auth/session";
import { handleChatRequest } from "../lib/chat/handler";
import { utcYearMonth } from "../lib/metering/period";
import { freshStore, mockOpenRouter } from "./helpers";

/**
 * QA V — AUTH_ALLOW_VERCEL_BYPASS acceptance (RED until App implements + docs).
 *
 * Extends AUTH_DEV_BYPASS so deliberate Vercel / production preview testing can
 * opt in. Gate remains in lib/auth/dev-bypass.ts (isAuthDevBypassActive).
 *
 * App contract (V1–V5):
 * - V1: AUTH_DEV_BYPASS=1 + AUTH_ALLOW_VERCEL_BYPASS=1 + empty Clerk → bypass ON
 *       with VERCEL=1 AND with NODE_ENV=production; session = dev_bypass_user;
 *       /api/chat not 401.
 * - V2: Without AUTH_ALLOW_VERCEL_BYPASS (unset or 0): existing D3 / D4 refuse
 *       behavior stays — NODE_ENV=production and VERCEL=1 / VERCEL_ENV=production
 *       still refuse bypass (GREEN regression; mirrors D3/D4a/D4b).
 * - V3: AUTH_ALLOW_VERCEL_BYPASS alone (AUTH_DEV_BYPASS unset/0) → bypass OFF.
 * - V4: Clerk keys present → bypass OFF even with both flags (+ Vercel/prod).
 * - V5: apps/web/.env.example documents AUTH_ALLOW_VERCEL_BYPASS as
 *       TEMPORARY / testing-only (RED until docs land).
 *
 * Safety: allow flag never enables bypass by itself; Clerk keys always win.
 */

const EXPECTED_BYPASS_ACCOUNT_ID = "dev_bypass_user";

const CLERK_PK = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY";
const CLERK_SK = "CLERK_SECRET_KEY";

const ENV_KEYS = [
  "AUTH_DEV_BYPASS",
  "AUTH_ALLOW_VERCEL_BYPASS",
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

/**
 * Baseline for Vercel-allow scenarios: both flags on, empty Clerk.
 * Callers override NODE_ENV / VERCEL / VERCEL_ENV for the case under test.
 */
function enableVercelAllowEligibleEnv(
  overrides: Record<string, string | undefined> = {},
) {
  process.env.AUTH_DEV_BYPASS = "1";
  process.env.AUTH_ALLOW_VERCEL_BYPASS = "1";
  process.env.NODE_ENV = "development";
  clearClerkKeys();
  clearHostingFlags();
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/**
 * Same shape as D* "eligible" env but WITHOUT AUTH_ALLOW_VERCEL_BYPASS
 * (unset) — used for V2 regression of D3/D4 refuse behavior.
 */
function enableBypassEligibleEnvWithoutAllow(
  overrides: Record<string, string | undefined> = {},
) {
  process.env.AUTH_DEV_BYPASS = "1";
  delete process.env.AUTH_ALLOW_VERCEL_BYPASS;
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
      "App must keep apps/web/lib/auth/dev-bypass.ts exporting DEV_BYPASS_ACCOUNT_ID and isAuthDevBypassActive()",
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

describe("QA V — AUTH_ALLOW_VERCEL_BYPASS", () => {
  it("V1a: both flags + empty Clerk + VERCEL=1 → isAuthDevBypassActive; session=dev_bypass_user; chat not 401", async () => {
    enableVercelAllowEligibleEnv({ VERCEL: "1" });

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
      { message: "vercel allow bypass chat" },
      { usageStore: store, openRouter: llm, now },
    );

    expect(result.status).not.toBe(401);
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(llm.calls).toBe(1);
    expect(
      await store.getSpend(EXPECTED_BYPASS_ACCOUNT_ID, utcYearMonth(now())),
    ).toBeGreaterThan(0);
  });

  it("V1b: both flags + empty Clerk + NODE_ENV=production → bypass ON; session=dev_bypass_user; chat not 401", async () => {
    enableVercelAllowEligibleEnv({ NODE_ENV: "production" });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(true);

    const session = await resolveAuthSession();
    expect(session).toEqual({
      authenticated: true,
      accountId: EXPECTED_BYPASS_ACCOUNT_ID,
    });

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "prod allow bypass chat" },
      { usageStore: freshStore(), openRouter: llm },
    );

    expect(result.status).not.toBe(401);
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(llm.calls).toBe(1);
  });

  it("V1c: both flags + empty Clerk + VERCEL=1 + NODE_ENV=production → bypass ON", async () => {
    enableVercelAllowEligibleEnv({
      VERCEL: "1",
      NODE_ENV: "production",
    });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(true);

    const session = await resolveAuthSession();
    expect(session).toEqual({
      authenticated: true,
      accountId: EXPECTED_BYPASS_ACCOUNT_ID,
    });
  });

  it("V2a: without AUTH_ALLOW_VERCEL_BYPASS + NODE_ENV=production → still refuse (D3 regression)", async () => {
    // Mirrors D3 — allow flag unset; production must refuse.
    enableBypassEligibleEnvWithoutAllow({ NODE_ENV: "production" });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    const session = await resolveAuthSession();
    expectNotBypassUser(session);
    expect(session.authenticated).toBe(false);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "prod must not bypass without allow" },
      { usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(llm.calls).toBe(0);
  });

  it("V2b: AUTH_ALLOW_VERCEL_BYPASS=0 + VERCEL=1 → still refuse (D4a regression)", async () => {
    enableBypassEligibleEnvWithoutAllow({
      AUTH_ALLOW_VERCEL_BYPASS: "0",
      VERCEL: "1",
    });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    const session = await resolveAuthSession();
    expectNotBypassUser(session);
    expect(session.authenticated).toBe(false);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "vercel hosting without allow" },
      { usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(llm.calls).toBe(0);
  });

  it("V2c: without AUTH_ALLOW_VERCEL_BYPASS + VERCEL_ENV=production → still refuse (D4b regression)", async () => {
    enableBypassEligibleEnvWithoutAllow({ VERCEL_ENV: "production" });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    const session = await resolveAuthSession();
    expectNotBypassUser(session);
    expect(session.authenticated).toBe(false);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "vercel_env production without allow" },
      { usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(llm.calls).toBe(0);
  });

  it("V3a: AUTH_ALLOW_VERCEL_BYPASS=1 but AUTH_DEV_BYPASS unset → no bypass", async () => {
    enableVercelAllowEligibleEnv({
      AUTH_DEV_BYPASS: undefined,
      VERCEL: "1",
      NODE_ENV: "production",
    });
    delete process.env.AUTH_DEV_BYPASS;

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    const session = await resolveAuthSession();
    expectNotBypassUser(session);
    expect(session.authenticated).toBe(false);
  });

  it("V3b: AUTH_ALLOW_VERCEL_BYPASS=1 but AUTH_DEV_BYPASS=0 → no bypass", async () => {
    enableVercelAllowEligibleEnv({
      AUTH_DEV_BYPASS: "0",
      VERCEL: "1",
    });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "allow alone is not enough" },
      { usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(llm.calls).toBe(0);
  });

  it("V4: both flags + Clerk keys present → bypass ignored (even under Vercel/prod)", async () => {
    enableVercelAllowEligibleEnv({
      VERCEL: "1",
      NODE_ENV: "production",
      [CLERK_PK]: "pk_test_not_empty_clerk_key",
      [CLERK_SK]: "sk_test_not_empty_clerk_key",
    });

    const gate = await loadDevBypassModule();
    expect(gate.isAuthDevBypassActive()).toBe(false);

    // Either key alone also disables bypass under allow flag
    enableVercelAllowEligibleEnv({
      VERCEL: "1",
      [CLERK_PK]: "pk_only",
    });
    expect(gate.isAuthDevBypassActive()).toBe(false);
    enableVercelAllowEligibleEnv({
      NODE_ENV: "production",
      [CLERK_SK]: "sk_only",
    });
    expect(gate.isAuthDevBypassActive()).toBe(false);

    enableVercelAllowEligibleEnv({
      VERCEL: "1",
      NODE_ENV: "production",
      [CLERK_PK]: "pk_test_not_empty_clerk_key",
      [CLERK_SK]: "sk_test_not_empty_clerk_key",
    });
    const session = await resolveAuthSession();
    expectNotBypassUser(session);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "clerk present must not bypass" },
      { usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(llm.calls).toBe(0);
  });

  it("V5: .env.example documents AUTH_ALLOW_VERCEL_BYPASS as TEMPORARY/testing-only", () => {
    const envExamplePath = path.resolve(__dirname, "../.env.example");
    expect(
      existsSync(envExamplePath),
      "apps/web/.env.example must exist",
    ).toBe(true);

    const text = readFileSync(envExamplePath, "utf8");
    expect(
      text,
      "App must document AUTH_ALLOW_VERCEL_BYPASS in apps/web/.env.example",
    ).toMatch(/AUTH_ALLOW_VERCEL_BYPASS/);
    expect(
      text,
      "AUTH_ALLOW_VERCEL_BYPASS docs must mark it TEMPORARY and/or testing-only",
    ).toMatch(/TEMPORARY|testing[-\s]?only/i);
  });
});
