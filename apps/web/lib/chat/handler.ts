import { resolveAuthSession } from "../auth/session";
import {
  LIMIT_REACHED_CODE,
  LIMIT_REACHED_STATUS,
} from "../metering/constants";
import { utcYearMonth } from "../metering/period";
import { canAllowLlm } from "../metering/quota";
import { getUsageStore } from "../metering/get-usage-store";
import {
  getWorkersAiClient,
  hasCloudflareChatEnv,
  type WorkersAiClient,
} from "../cloudflare/client";
import type { UsageStore } from "../metering/usage-store";
import { buildAnswer, type Answer } from "./answer";
import { runCpiFixtureTools } from "./tools/cpi-fixtures";

export interface ChatHandlerDeps {
  auth?: typeof resolveAuthSession;
  usageStore?: UsageStore;
  /** Cloudflare Workers AI client (preferred). */
  llm?: WorkersAiClient;
  /**
   * Alias kept so existing QA injects (`openRouter: mock…`) stay green
   * until QA rebases E-suite helpers. Prefer `llm`.
   */
  openRouter?: WorkersAiClient;
  /** Inject "now" for month-boundary tests. */
  now?: () => Date;
  /** Skip fixture tools (unit tests that only care about LLM/metering). */
  skipTools?: boolean;
}

export interface ChatSuccessBody {
  ok: true;
  /** Convenience: prose string (also in answer.prose). */
  message: string;
  /** Generative UI payload. */
  answer: Answer;
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
  /**
   * True only when the LLM client was actually invoked.
   * Named openRouterCalled for backward-compatible QA assertions.
   */
  openRouterCalled: boolean;
  /** Alias of openRouterCalled. */
  llmCalled: boolean;
  /** True only when spend was incremented. */
  spendIncremented: boolean;
}

/**
 * Core protected chat flow:
 * 1. Auth required — else 401, no LLM, no tools.
 * 2. Quota check (account_id + UTC YYYY-MM) — at/over $5.00 → 402 LIMIT_REACHED.
 * 3. Missing Cloudflare Workers AI creds on live path → LLM_NOT_CONFIGURED (not 401).
 * 4. Fixture/data tools → typed Answer parts; LLM prose when configured.
 * 5. Successful LLM increments spend (idempotent by generation id); failures do not.
 */
export async function handleChatRequest(
  input: { message?: unknown },
  deps: ChatHandlerDeps = {},
): Promise<ChatHandlerResult> {
  const authFn = deps.auth ?? resolveAuthSession;
  const store = deps.usageStore ?? getUsageStore();
  const llmInjected = deps.llm ?? deps.openRouter;
  const usingLiveLlm = llmInjected === undefined;
  const llm = llmInjected ?? getWorkersAiClient();
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
      llmCalled: false,
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
      llmCalled: false,
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
      llmCalled: false,
      spendIncremented: false,
    };
  }

  // Live path with missing CF creds → LLM_NOT_CONFIGURED (not 401 / no spend).
  if (usingLiveLlm && !hasCloudflareChatEnv()) {
    return {
      status: 503,
      body: {
        ok: false,
        code: "LLM_NOT_CONFIGURED",
        error:
          "Cloudflare Workers AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
      },
      openRouterCalled: false,
      llmCalled: false,
      spendIncremented: false,
    };
  }

  const toolParts = deps.skipTools ? [] : runCpiFixtureTools(message);

  const llmResult = await llm.chat({
    messages: [
      {
        role: "system",
        content:
          "You are InflationMonitor assistant. Reply briefly about CPI. Structured charts/tables are attached separately as generative UI parts — do not dump large markdown tables.",
      },
      { role: "user", content: message },
    ],
  });

  if (!llmResult.ok) {
    if (llmResult.notConfigured || (usingLiveLlm && !hasCloudflareChatEnv())) {
      return {
        status:
          llmResult.status === 500 || llmResult.status === 503
            ? llmResult.status
            : 503,
        body: {
          ok: false,
          code: "LLM_NOT_CONFIGURED",
          error:
            llmResult.error ||
            "Cloudflare Workers AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
        },
        openRouterCalled: false,
        llmCalled: false,
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
      llmCalled: true,
      spendIncremented: false,
    };
  }

  const newSpend = await store.incrementSpend(
    session.accountId,
    yearMonth,
    llmResult.costUsd,
    llmResult.generationId,
  );

  const answer = buildAnswer({
    prose: llmResult.content,
    parts: toolParts,
    yearMonth,
    spendUsd: newSpend,
  });

  return {
    status: 200,
    body: {
      ok: true,
      message: llmResult.content,
      answer,
      yearMonth,
      spendUsd: newSpend,
    },
    openRouterCalled: true,
    llmCalled: true,
    spendIncremented: true,
  };
}
