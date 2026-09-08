# @inflationmonitor/web

Next.js App Router (TypeScript) chat app for Vercel with:

1. **Clerk auth** — sign-in required before chat. Unauthenticated `/api/chat` → `401`; no LLM calls.
2. **OpenRouter-only LLM gateway** with a **$5.00 USD / account / UTC calendar month** hard stop.
3. **Metered spend** persisted in `app_usage_monthly` (plus `app_usage_ledger` for idempotent increments) via `DATABASE_URL`. Tables are `app_`-prefixed so they never collide with CPI schema in `packages/data`.

CPI lookup tools / charts / free-form SQL are **not** implemented here.

## Setup

```bash
# from monorepo root
npm install
cp apps/web/.env.example apps/web/.env.local
# fill Clerk + OpenRouter + DATABASE_URL

# create metering tables (once per database)
npm run db:ensure --workspace=@inflationmonitor/web

npm run dev --workspace=@inflationmonitor/web
```

### Environment

See [`.env.example`](./.env.example):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk auth |
| `AUTH_DEV_BYPASS` | Local-only auth bypass (see below) |
| `OPENROUTER_API_KEY` | OpenRouter LLM (only provider) |
| `OPENROUTER_MODEL` | Optional model id (default `openai/gpt-4o-mini`) |
| `DATABASE_URL` | Postgres/Neon for `app_usage_monthly` |
| `NEXT_PUBLIC_APP_URL` | Public URL (OpenRouter referer) |


### AUTH_DEV_BYPASS (local development only)

For local UI work without Clerk, set `AUTH_DEV_BYPASS=1` and leave both Clerk keys unset (or empty). Middleware and `resolveAuthSession` then treat the request as authenticated with fixed `account_id` `dev_bypass_user`.

Bypass is **active only** when all of the following are true (evaluated at call time, not cached):

- `AUTH_DEV_BYPASS === "1"`
- `NODE_ENV === "development"`
- both `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are missing or empty
- `VERCEL` is not `"1"`
- `VERCEL_ENV` is not `"production"`

**Safety**

- Either Clerk key alone (non-empty) **disables** bypass — set real Clerk keys and bypass is ignored.
- Refused on Vercel hosting (`VERCEL=1`) and when `VERCEL_ENV=production`, even if `NODE_ENV=development`.
- Never enable on shared, preview, or production environments.
- With bypass active but `OPENROUTER_API_KEY` missing, `/api/chat` returns **503** `{ ok: false, code: "LLM_NOT_CONFIGURED", … }` (not 401) and does not increment spend.

Shared gate: `lib/auth/dev-bypass.ts` (`DEV_BYPASS_ACCOUNT_ID`, `isAuthDevBypassActive()`).

## Metering rules

- Cap key: `account_id` (Clerk `userId`, or `dev_bypass_user` under bypass) + `YYYY-MM` in **UTC**.
- **Exactly $5.00 = over-cap** (`spend >= 5` → blocked).
- Over-cap response: HTTP **402** with stable JSON `{ "ok": false, "code": "LIMIT_REACHED", "error": "…" }`.
- Zero OpenRouter calls when capped.
- New UTC month resets (prior month over-cap does not block the new month).
- **Successful** LLM usage increments spend; **failed** or **quota-blocked** attempts do not.
- Spend increments accept an OpenRouter `generationId` as **idempotency key** so retries do not double-bill (`app_usage_ledger`).

## Tests

```bash
npm test --workspace=@inflationmonitor/web
# or from root: npm test   # runs data + web workspaces
```

Vitest covers QA cases A1–A3 (auth), B1–B5 (quota), C1–C2 (spend), and D1–D6 (`AUTH_DEV_BYPASS`), with Clerk / OpenRouter / DB mocked via in-memory stores.

## Scripts

| Script | Description |
|--------|-------------|
| `dev` / `build` / `start` | Next.js |
| `test` | Vitest |
| `db:ensure` | Apply `sql/app_usage_monthly.sql` |
