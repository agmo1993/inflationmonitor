/**
 * Return the UTC calendar month key as YYYY-MM.
 * Spend caps reset on UTC month boundaries (not account-local timezones).
 */
export function utcYearMonth(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
