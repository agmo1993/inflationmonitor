import { resolveAuthSession } from "../auth/session";
import {
  LIMIT_REACHED_CODE,
  LIMIT_REACHED_STATUS,
} from "../metering/constants";
import { utcYearMonth } from "../metering/period";
import { canAllowLlm } from "../metering/quota";
import { getUsageStore } from "../metering/get-usage-store";
import { getOpenRouterClient } from "../openrouter/client";
import type { UsageStore } from "../metering/usage-store";
import type { OpenRouterClient } from "../openrouter/client";

export interface ChatHandlerDeps {
  auth?: typeof resolveAuthSession;
  usageStore?: UsageStore;
  openRouter?: OpenRouterClient;
  /** Inject "now" for month-boundary tests. */
  now?: () => Date;
}

export interface ChatSuccessBody {
  ok: true;
  message: string;
  yearMonth: string;
  spendUsd: number;
}

export interface ChatErrorBody {
  ok: false;
  code?:
    | typeof LIMIT_REACHED_CODE
    | "UNAUTHORIZED"
    | "BAD_REQUEST"
    | "LLM_ERROR"
    | "LLM_NOT_CONFIGURED";
  error: string;
}

export interface ChatHandlerResult {
  status: number;
  body: ChatSuccessBody | ChatErrorBody;
  /** True only when OpenRouter was actually invoked. */
  openRouterCalled: boolean;
  /** True only when spend was incremented. */
  spendIncremented: boolean;
}

function isOpenRouterKeyMissing(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return key === undefined || key === "";
}

/**
 * Core protected chat flow:
 * 1. Auth required — else 401, no LLM, no tools.
 * 2. Quota check (account_id + UTC YYYY-MM) — at/over $5.00 → 402 LIMIT_REACHED, zero OpenRouter.
 * 3. OpenRouter call; on success increment spend (idempotent by generation id).
 * 4. Failed LLM calls do not increment spend.
 * 5. Live client with missing OPENROUTER_API_KEY → LLM_NOT_CONFIGURED (not 401).
 */
export async function handleChatRequest(
  input: { message?: unknown },
  deps: ChatHandlerDeps = {},
): Promise<ChatHandlerResult> {
  const authFn = deps.auth ?? resolveAuthSession;
  const store = deps.usageStore ?? getUsageStore();
  const usingLiveOpenRouter = deps.openRouter === undefined;
  const llm = deps.openRouter ?? getOpenRouterClient();
  const now = deps.now ?? (() => new Date());

  const session = await authFn();
  if (!session.authenticated) {
    return {
      status: 401,
      body: {
        ok: false,
        code: "UNAUTHORIZED",
        error:
          session.reason === "invalid_session"
            ? "Invalid or expired session"
            : "Authentication required",
      },
      openRouterCalled: false,
      spendIncremented: false,
    };
  }

  const message =
    typeof input.message === "string" ? input.message.trim() : "";
  if (!message) {
    return {
      status: 400,
      body: { ok: false, code: "BAD_REQUEST", error: "message is required" },
      openRouterCalled: false,
      spendIncremented: false,
    };
  }

  const yearMonth = utcYearMonth(now());
  const spendUsd = await store.getSpend(session.accountId, yearMonth);

  if (!canAllowLlm(spendUsd)) {
    return {
      status: LIMIT_REACHED_STATUS,
      body: {
        ok: false,
        code: LIMIT_REACHED_CODE,
        error: `Monthly spend limit of $5.00 USD reached for ${yearMonth} (UTC). Resets next UTC month.`,
      },
      openRouterCalled: false,
      spendIncremented: false,
    };
  }

  // Live OpenRouter path with no API key → LLM_NOT_CONFIGURED (not 401 / no spend).
  if (usingLiveOpenRouter && isOpenRouterKeyMissing()) {
    return {
      status: 503,
      body: {
        ok: false,
        code: "LLM_NOT_CONFIGURED",
        error:
          "OPENROUTER_API_KEY is not configured; OpenRouter is required for chat",
      },
      openRouterCalled: false,
      spendIncremented: false,
    };
  }

  const llmResult = await llm.chat({
    messages: [
      {
        role: "system",
        content:
          "You are InflationMonitor assistant. CPI tools are not wired yet; reply briefly.",
      },
      { role: "user", content: message },
    ],
  });

  if (!llmResult.ok) {
    // Map live-client missing-key failures to LLM_NOT_CONFIGURED as a safety net.
    const missingKeyFailure =
      usingLiveOpenRouter &&
      isOpenRouterKeyMissing() &&
      /openrouter/i.test(llmResult.error);
    if (missingKeyFailure) {
      return {
        status:
          llmResult.status === 500 || llmResult.status === 503
            ? llmResult.status
            : 503,
        body: {
          ok: false,
          code: "LLM_NOT_CONFIGURED",
          error: llmResult.error,
        },
        openRouterCalled: false,
        spendIncremented: false,
      };
    }

    return {
      status: llmResult.status && llmResult.status >= 400 ? llmResult.status : 502,
      body: {
        ok: false,
        code: "LLM_ERROR",
        error: llmResult.error,
      },
      openRouterCalled: true,
      spendIncremented: false,
    };
  }

  const newSpend = await store.incrementSpend(
    session.accountId,
    yearMonth,
    llmResult.costUsd,
    llmResult.generationId,
  );

  return {
    status: 200,
    body: {
      ok: true,
      message: llmResult.content,
      yearMonth,
      spendUsd: newSpend,
    },
    openRouterCalled: true,
    spendIncremented: true,
  };
}
