# @inflationmonitor/web

Next.js App Router chat app: Clerk auth, Cloudflare Workers AI, generative UI (answer.parts), DESIGN.md theme tokens, and $5/mo metering.

See `.env.example` for `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, optional `CHAT_MODEL`, and `AUTH_DEV_BYPASS`.

Tests: `./node_modules/.bin/vitest run`

## Auth bypass
AUTH_DEV_BYPASS=1 + empty Clerk keys + NODE_ENV=development (not on Vercel) authenticates as dev_bypass_user.

For **TEMPORARY** Vercel preview/test only: also set `AUTH_ALLOW_VERCEL_BYPASS=1` (with empty Clerk) so bypass works when `VERCEL=1` / `NODE_ENV=production`. Do not leave on long-term public prod. Vercel Root Directory should be `apps/web`.
Missing CF creds then returns LLM_NOT_CONFIGURED (no OpenRouter strings).

## Metering cost proxy
lib/cloudflare/cost.ts prefers native CF USD cost; else estimates from tokens or CF_COST_PER_REQUEST_USD floor so the $5/mo hard stop still meters.

## E2E (optional)
Sibling harness: /workspace/inflationmonitor-e2e (Playwright). Not a PR gate.
