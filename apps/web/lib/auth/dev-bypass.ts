/**
 * Auth bypass for development without Clerk, plus an optional TEMPORARY
 * Vercel/preview escape hatch.
 *
 * Evaluated at call time — never cache the result across requests.
 *
 * Base path (local): active only when ALL of:
 * - AUTH_DEV_BYPASS === "1"
 * - NODE_ENV === "development"
 * - both Clerk keys missing or empty
 * - VERCEL is not "1"
 * - VERCEL_ENV is not "production"
 *
 * Escape hatch (TEMPORARY / testing-only): when
 * AUTH_DEV_BYPASS === "1" AND AUTH_ALLOW_VERCEL_BYPASS === "1" AND both Clerk
 * keys empty → bypass ON even if VERCEL=1 and/or NODE_ENV=production
 * (and even if VERCEL_ENV=production). Never enable with real Clerk keys.
 *
 * Either Clerk key alone (non-empty) disables bypass.
 * Without AUTH_ALLOW_VERCEL_BYPASS, Vercel / production still refuse bypass.
 */

export const DEV_BYPASS_ACCOUNT_ID = "dev_bypass_user";

function isEmptyEnv(value: string | undefined): boolean {
  return value === undefined || value === "";
}

function clerkKeysEmpty(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sk = process.env.CLERK_SECRET_KEY;
  return isEmptyEnv(pk) && isEmptyEnv(sk);
}

export function isAuthDevBypassActive(): boolean {
  if (process.env.AUTH_DEV_BYPASS !== "1") return false;
  if (!clerkKeysEmpty()) return false;

  // TEMPORARY escape hatch for intentional Vercel preview / test deploys.
  if (process.env.AUTH_ALLOW_VERCEL_BYPASS === "1") {
    return true;
  }

  if (process.env.NODE_ENV !== "development") return false;
  if (process.env.VERCEL === "1") return false;
  if (process.env.VERCEL_ENV === "production") return false;

  return true;
}
