import { describe, expect, it } from "vitest";
import { handleChatRequest } from "../lib/chat/handler";
import { LIMIT_REACHED_CODE, LIMIT_REACHED_STATUS, MONTHLY_SPEND_CAP_USD } from "../lib/metering/constants";
import { utcYearMonth } from "../lib/metering/period";
import { authOk, freshStore, mockOpenRouter, utcDate } from "./helpers";

describe("QA B — monthly quota hard stop", () => {
  it("B1: MTD spend < $5 → allowed", async () => {
    const store = freshStore();
    const accountId = "acct_b1";
    const ym = utcYearMonth(utcDate("2026-09-15T12:00:00Z"));
    await store.incrementSpend(accountId, ym, 4.99);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "ok?" },
      {
        auth: authOk(accountId),
        usageStore: store,
        openRouter: llm,
        now: () => utcDate("2026-09-15T12:00:00Z"),
      },
    );

    expect(result.status).toBe(200);
    expect(llm.calls).toBe(1);
    expect(result.openRouterCalled).toBe(true);
  });

  it("B2: spend exactly $5.00 → hard stop", async () => {
    const store = freshStore();
    const accountId = "acct_b2";
    const ym = utcYearMonth(utcDate("2026-09-15T12:00:00Z"));
    await store.incrementSpend(accountId, ym, MONTHLY_SPEND_CAP_USD);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "ok?" },
      {
        auth: authOk(accountId),
        usageStore: store,
        openRouter: llm,
        now: () => utcDate("2026-09-15T12:00:00Z"),
      },
    );

    expect(result.status).toBe(LIMIT_REACHED_STATUS);
    expect(result.body).toMatchObject({ ok: false, code: LIMIT_REACHED_CODE });
    expect(llm.calls).toBe(0);
    expect(result.openRouterCalled).toBe(false);
  });

  it("B3: spend > $5 → hard stop; clear limit-reached; zero OpenRouter calls", async () => {
    const store = freshStore();
    const accountId = "acct_b3";
    const ym = utcYearMonth(utcDate("2026-09-15T12:00:00Z"));
    await store.incrementSpend(accountId, ym, 5.5);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "ok?" },
      {
        auth: authOk(accountId),
        usageStore: store,
        openRouter: llm,
        now: () => utcDate("2026-09-15T12:00:00Z"),
      },
    );

    expect(result.status).toBe(402);
    expect(result.body).toEqual(
      expect.objectContaining({ ok: false, code: "LIMIT_REACHED" }),
    );
    expect(llm.calls).toBe(0);
    expect(result.openRouterCalled).toBe(false);
    expect(result.spendIncremented).toBe(false);
  });

  it("B4: keyed by account_id + YYYY-MM UTC; new month resets", async () => {
    const store = freshStore();
    const accountId = "acct_b4";
    // Cap out August
    await store.incrementSpend(accountId, "2026-08", 5.0);
    expect(await store.getSpend(accountId, "2026-08")).toBe(5.0);
    // September starts at 0
    expect(await store.getSpend(accountId, "2026-09")).toBe(0);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "new month" },
      {
        auth: authOk(accountId),
        usageStore: store,
        openRouter: llm,
        now: () => utcDate("2026-09-01T00:00:00Z"),
      },
    );
    expect(result.status).toBe(200);
    expect(llm.calls).toBe(1);
    if (result.body.ok) {
      expect(result.body.yearMonth).toBe("2026-09");
    }
  });

  it("B5: prior month over-cap → allowed in new month if under cap", async () => {
    const store = freshStore();
    const accountId = "acct_b5";
    await store.incrementSpend(accountId, "2026-07", 9.99);

    const llm = mockOpenRouter();
    const result = await handleChatRequest(
      { message: "fresh month" },
      {
        auth: authOk(accountId),
        usageStore: store,
        openRouter: llm,
        now: () => utcDate("2026-08-05T08:00:00Z"),
      },
    );

    expect(result.status).toBe(200);
    expect(llm.calls).toBe(1);
    expect(await store.getSpend(accountId, "2026-07")).toBe(9.99);
    expect(await store.getSpend(accountId, "2026-08")).toBeGreaterThan(0);
  });
});
