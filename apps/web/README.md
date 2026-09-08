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
| `OPENROUTER_API_KEY` | OpenRouter LLM (only provider) |
| `OPENROUTER_MODEL` | Optional model id (default `openai/gpt-4o-mini`) |
| `DATABASE_URL` | Postgres/Neon for `app_usage_monthly` |
| `NEXT_PUBLIC_APP_URL` | Public URL (OpenRouter referer) |

## Metering rules

- Cap key: `account_id` (Clerk `userId`) + `YYYY-MM` in **UTC**.
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

Vitest covers QA cases A1–A3 (auth), B1–B5 (quota), C1–C2 (spend), with Clerk / OpenRouter / DB mocked via in-memory stores.

## Scripts

| Script | Description |
|--------|-------------|
| `dev` / `build` / `start` | Next.js |
| `test` | Vitest |
| `db:ensure` | Apply `sql/app_usage_monthly.sql` |
