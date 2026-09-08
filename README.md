# InflationMonitor

CPI data platform monorepo (multi-country from day one).

## Packages

| Path | Role |
|------|------|
| `packages/data` | Postgres/Neon schema, migrations, AU ABS + US BLS loaders, freshness checks |
| `apps/web` | Stub — Next.js app will live here later |

## Quick start

```bash
bun install
cp packages/data/.env.example packages/data/.env   # set DATABASE_URL
bun run migrate
bun test
```

Workspace clients that understand npm workspaces can use `npm test` / `npm run test -w @inflationmonitor/data` equivalently.

See [`packages/data/README.md`](packages/data/README.md) and [`packages/data/SCHEMA.md`](packages/data/SCHEMA.md).
