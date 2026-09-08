import { MONTHLY_SPEND_CAP_USD } from "./constants";

/**
 * Hard stop when month-to-date spend is >= $5.00 USD.
 * Exactly $5.00 counts as over-cap (no further LLM calls).
 */
export function isOverCap(spendUsd: number): boolean {
  return spendUsd >= MONTHLY_SPEND_CAP_USD;
}

export function canAllowLlm(spendUsd: number): boolean {
  return !isOverCap(spendUsd);
}
