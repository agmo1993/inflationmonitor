import { describe, expect, it } from "vitest";
import { handleChatRequest } from "../lib/chat/handler";
import {
  LIMIT_REACHED_CODE,
  LIMIT_REACHED_STATUS,
  MONTHLY_SPEND_CAP_USD,
} from "../lib/metering/constants";
import { utcYearMonth } from "../lib/metering/period";
import { authOk, freshStore, utcDate } from "./helpers";
import { mockWorkersAi } from "./helpers-cf";

/**
 * QA E3 — $5/mo hard stop still enforced against Cloudflare Workers AI usage.
 *
 * Keyed by account_id + YYYY-MM UTC; zero CF LLM calls when over cap.
 * RED until App wires metering to the Workers AI chat path (`llm` dep).
 */

type LlmDeps = Parameters<typeof handleChatRequest>[1] & {
  llm: ReturnType<typeof mockWorkersAi>;
};

describe("QA E3 — CF usage metering hard stop", () => {
  it("E3a: spend exactly $5.00 → LIMIT_REACHED; zero Workers AI calls", async () => {
    const store = freshStore();
    const accountId = "acct_e3a";
    const now = () => utcDate("2026-09-15T12:00:00Z");
    const ym = utcYearMonth(now());
    await store.incrementSpend(accountId, ym, MONTHLY_SPEND_CAP_USD);

    const llm = mockWorkersAi();
    const result = await handleChatRequest(
      { message: "over cap" },
      { auth: authOk(accountId), usageStore: store, llm, now } as LlmDeps,
    );

    expect(result.status).toBe(LIMIT_REACHED_STATUS);
    expect(result.body).toMatchObject({ ok: false, code: LIMIT_REACHED_CODE });
    expect(llm.calls).toBe(0);
    expect((result as { llmCalled?: boolean }).llmCalled).toBe(false);
    expect(result.spendIncremented).toBe(false);
  });

  it("E3b: spend > $5 → hard stop; no CF LLM; spend unchanged", async () => {
    const store = freshStore();
    const accountId = "acct_e3b";
    const now = () => utcDate("2026-09-15T12:00:00Z");
    const ym = utcYearMonth(now());
    await store.incrementSpend(accountId, ym, 5.5);
    const before = await store.getSpend(accountId, ym);

    const llm = mockWorkersAi();
    const result = await handleChatRequest(
      { message: "still blocked" },
      { auth: authOk(accountId), usageStore: store, llm, now } as LlmDeps,
    );

    expect(result.status).toBe(402);
    expect(result.body).toMatchObject({ ok: false, code: "LIMIT_REACHED" });
    expect(llm.calls).toBe(0);
    expect((result as { llmCalled?: boolean }).llmCalled).toBe(false);
    expect(await store.getSpend(accountId, ym)).toBe(before);
  });

  it("E3c: under-cap successful CF call increments spend for account_id + YYYY-MM UTC", async () => {
    const store = freshStore();
    const accountId = "acct_e3c";
    const now = () => utcDate("2026-09-10T10:00:00Z");
    const ym = utcYearMonth(now());

    const llm = mockWorkersAi(() => ({
      ok: true,
      content: "metered cf",
      costUsd: 0.4,
      generationId: "cf-e3c-1",
    }));

    const result = await handleChatRequest(
      { message: "bill cf" },
      { auth: authOk(accountId), usageStore: store, llm, now } as LlmDeps,
    );

    expect(result.status).toBe(200);
    expect(llm.calls).toBe(1);
    expect((result as { llmCalled?: boolean }).llmCalled).toBe(true);
    expect(result.spendIncremented).toBe(true);
    expect(await store.getSpend(accountId, ym)).toBe(0.4);
  });
});
