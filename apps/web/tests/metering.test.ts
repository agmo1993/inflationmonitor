import { describe, expect, it } from "vitest";
import { handleChatRequest } from "../lib/chat/handler";
import { LIMIT_REACHED_CODE } from "../lib/metering/constants";
import { utcYearMonth } from "../lib/metering/period";
import { authOk, freshStore, mockOpenRouter, utcDate } from "./helpers";

describe("QA C — spend increments", () => {
  it("C1: successful LLM usage increments current-month spend", async () => {
    const store = freshStore();
    const accountId = "acct_c1";
    const now = () => utcDate("2026-09-10T10:00:00Z");
    const ym = utcYearMonth(now());

    expect(await store.getSpend(accountId, ym)).toBe(0);

    const llm = mockOpenRouter(() => ({
      ok: true,
      content: "ok",
      costUsd: 0.4,
      generationId: "gen-c1-1",
    }));

    const result = await handleChatRequest(
      { message: "bill me" },
      { auth: authOk(accountId), usageStore: store, openRouter: llm, now },
    );

    expect(result.status).toBe(200);
    expect(result.spendIncremented).toBe(true);
    expect(await store.getSpend(accountId, ym)).toBe(0.4);

    // Idempotent retry with same generation id must not double-bill
    await store.incrementSpend(accountId, ym, 0.4, "gen-c1-1");
    expect(await store.getSpend(accountId, ym)).toBe(0.4);
  });

  it("C2: failed LLM does not increment spend", async () => {
    const store = freshStore();
    const accountId = "acct_c2_fail";
    const now = () => utcDate("2026-09-10T10:00:00Z");
    const ym = utcYearMonth(now());

    const llm = mockOpenRouter(() => ({
      ok: false,
      error: "upstream boom",
      status: 502,
    }));

    const result = await handleChatRequest(
      { message: "fail please" },
      { auth: authOk(accountId), usageStore: store, openRouter: llm, now },
    );

    expect(result.openRouterCalled).toBe(true);
    expect(result.spendIncremented).toBe(false);
    expect(result.status).toBe(502);
    expect(await store.getSpend(accountId, ym)).toBe(0);
  });

  it("C2b: blocked-by-quota does not increment spend", async () => {
    const store = freshStore();
    const accountId = "acct_c2_quota";
    const now = () => utcDate("2026-09-10T10:00:00Z");
    const ym = utcYearMonth(now());
    await store.incrementSpend(accountId, ym, 5.0);

    const llm = mockOpenRouter();
    const before = await store.getSpend(accountId, ym);

    const result = await handleChatRequest(
      { message: "blocked" },
      { auth: authOk(accountId), usageStore: store, openRouter: llm, now },
    );

    expect(result.body).toMatchObject({ ok: false, code: LIMIT_REACHED_CODE });
    expect(llm.calls).toBe(0);
    expect(result.spendIncremented).toBe(false);
    expect(await store.getSpend(accountId, ym)).toBe(before);
  });
});
