/**
 * Pluggable USD cost estimator for Cloudflare Workers AI metering.
 *
 * CF Workers AI responses often omit a native dollar cost. When `usage.cost`
 * / `usage.total_cost` / top-level `cost` is present we prefer that. Otherwise
 * we estimate from token counts (or a per-request floor) so the $5/account/UTC
 * month hard stop remains enforceable.
 *
 * Rates are conservative proxies (not Cloudflare invoice prices). Override via
 * env:
 *   CF_COST_INPUT_PER_MTOK   — USD per 1M input tokens (default 0.30)
 *   CF_COST_OUTPUT_PER_MTOK  — USD per 1M output tokens (default 0.50)
 *   CF_COST_PER_REQUEST_USD  — floor when no token usage (default 0.002)
 */

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface CostEstimateInput {
  /** Prefer any dollar figure Cloudflare returned. */
  nativeCostUsd?: number;
  usage?: TokenUsage;
  /** Model id (reserved for future per-model tables). */
  model?: string;
}

export interface CostEstimator {
  estimate(input: CostEstimateInput): number;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Default estimator used in production. */
export function createDefaultCostEstimator(): CostEstimator {
  return {
    estimate(input) {
      if (
        typeof input.nativeCostUsd === "number" &&
        Number.isFinite(input.nativeCostUsd) &&
        input.nativeCostUsd >= 0
      ) {
        return roundUsd(input.nativeCostUsd);
      }

      const inputPerM = envNumber("CF_COST_INPUT_PER_MTOK", 0.3);
      const outputPerM = envNumber("CF_COST_OUTPUT_PER_MTOK", 0.5);
      const perRequest = envNumber("CF_COST_PER_REQUEST_USD", 0.002);

      const usage = input.usage ?? {};
      let prompt = usage.promptTokens ?? 0;
      let completion = usage.completionTokens ?? 0;
      if (
        (!prompt && !completion) &&
        typeof usage.totalTokens === "number" &&
        usage.totalTokens > 0
      ) {
        // Split unknown total 70/30 when only total is available.
        prompt = Math.round(usage.totalTokens * 0.7);
        completion = usage.totalTokens - prompt;
      }

      if (prompt > 0 || completion > 0) {
        const usd =
          (prompt / 1_000_000) * inputPerM +
          (completion / 1_000_000) * outputPerM;
        // Never bill literally $0 for a successful call — keep a tiny floor.
        return roundUsd(Math.max(usd, perRequest * 0.25));
      }

      return roundUsd(perRequest);
    },
  };
}

export function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Pull a native USD cost and token usage from a Cloudflare AI JSON body.
 * Tolerates several response shapes (OpenAI-style usage, CF result wrapper).
 */
export function extractUsageFromCfBody(body: unknown): {
  nativeCostUsd?: number;
  usage: TokenUsage;
} {
  if (!body || typeof body !== "object") return { usage: {} };
  const root = body as Record<string, unknown>;
  const result =
    root.result && typeof root.result === "object" && !Array.isArray(root.result)
      ? (root.result as Record<string, unknown>)
      : root;

  const nativeCostUsd = pickNumber(
    result.cost,
    result.total_cost,
    (result.usage as Record<string, unknown> | undefined)?.cost,
    (result.usage as Record<string, unknown> | undefined)?.total_cost,
    root.cost,
    (root.usage as Record<string, unknown> | undefined)?.cost,
  );

  const usageObj =
    (result.usage && typeof result.usage === "object"
      ? (result.usage as Record<string, unknown>)
      : null) ??
    (root.usage && typeof root.usage === "object"
      ? (root.usage as Record<string, unknown>)
      : null);

  const usage: TokenUsage = {};
  if (usageObj) {
    const prompt = pickNumber(
      usageObj.prompt_tokens,
      usageObj.promptTokens,
      usageObj.input_tokens,
    );
    const completion = pickNumber(
      usageObj.completion_tokens,
      usageObj.completionTokens,
      usageObj.output_tokens,
    );
    const total = pickNumber(usageObj.total_tokens, usageObj.totalTokens);
    if (prompt !== undefined) usage.promptTokens = prompt;
    if (completion !== undefined) usage.completionTokens = completion;
    if (total !== undefined) usage.totalTokens = total;
  }

  return {
    nativeCostUsd,
    usage,
  };
}

function pickNumber(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return undefined;
}
