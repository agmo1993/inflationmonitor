/**
 * Local-only auth bypass for development without Clerk.
 * Evaluated at call time — never cache the result across requests.
 *
 * Active only when ALL of:
 * - AUTH_DEV_BYPASS === "1"
 * - NODE_ENV === "development"
 * - both Clerk keys missing or empty
 * - VERCEL is not "1"
 * - VERCEL_ENV is not "production"
 *
 * Either Clerk key alone (non-empty) disables bypass.
 * Refused on Vercel / production regardless of AUTH_DEV_BYPASS.
 */

export const DEV_BYPASS_ACCOUNT_ID = "dev_bypass_user";

function isEmptyEnv(value: string | undefined): boolean {
  return value === undefined || value === "";
}

export function isAuthDevBypassActive(): boolean {
  if (process.env.AUTH_DEV_BYPASS !== "1") return false;
  if (process.env.NODE_ENV !== "development") return false;
  if (process.env.VERCEL === "1") return false;
  if (process.env.VERCEL_ENV === "production") return false;

  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sk = process.env.CLERK_SECRET_KEY;
  if (!isEmptyEnv(pk) || !isEmptyEnv(sk)) return false;

  return true;
}
