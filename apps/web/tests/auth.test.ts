import { describe, expect, it } from "vitest";
import { handleChatRequest } from "../lib/chat/handler";
import { authNone, authOk, freshStore, instrumentedStore, mockOpenRouter } from "./helpers";

describe("QA A — auth gate", () => {
  it("A1: unauthenticated POST → 401; no LLM; no tools", async () => {
    const llm = mockOpenRouter();
    const store = freshStore();

    const result = await handleChatRequest(
      { message: "what is CPI?" },
      { auth: authNone("unauthenticated"), usageStore: store, openRouter: llm },
    );

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(result.openRouterCalled).toBe(false);
    expect(llm.calls).toBe(0);
    expect(result.spendIncremented).toBe(false);
  });

  it("A1b: unauthenticated GET-style (no message) still 401 before anything else", async () => {
    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: undefined },
      { auth: authNone(), usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(401);
    expect(llm.calls).toBe(0);
  });

  it("A1c: unauthenticated must not touch usage store (no metering side effects)", async () => {
    const llm = mockOpenRouter();
    const store = instrumentedStore();

    const result = await handleChatRequest(
      { message: "probe" },
      { auth: authNone("unauthenticated"), usageStore: store, openRouter: llm },
    );

    expect(result.status).toBe(401);
    expect(llm.calls).toBe(0);
    expect(store.getSpendCalls).toBe(0);
    expect(store.incrementSpendCalls).toBe(0);
    expect(result.spendIncremented).toBe(false);
  });

  it("A2: authenticated → allowed subject to quota", async () => {
    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "hello" },
      { auth: authOk("acct_a2"), usageStore: freshStore(), openRouter: llm },
    );
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(llm.calls).toBe(1);
    expect(result.openRouterCalled).toBe(true);
  });

  it("A3: expired/invalid session = unauthenticated (401, no LLM)", async () => {
    const llm = mockOpenRouter();
    const store = instrumentedStore();
    const result = await handleChatRequest(
      { message: "hello" },
      {
        auth: authNone("invalid_session"),
        usageStore: store,
        openRouter: llm,
      },
    );
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    if (!result.body.ok) {
      expect(result.body.error.toLowerCase()).toMatch(/invalid|expired/);
    }
    expect(llm.calls).toBe(0);
    expect(store.getSpendCalls).toBe(0);
    expect(store.incrementSpendCalls).toBe(0);
  });
});
