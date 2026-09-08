# @inflationmonitor/data

TypeScript package: CPI schema, SQL migrations (Drizzle), AU ABS + US BLS loaders, freshness checks.

## Environment

```bash
cp .env.example .env
# DATABASE_URL=postgres://...  (Neon or any Postgres)
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | for migrate/load CLI | Postgres connection string |

## Scripts

From repo root (workspaces) or this package:

| Script | Purpose |
|--------|---------|
| `test` | Run vitest suites (PGlite) |
| `migrate` | Apply drizzle-kit migrations (`DATABASE_URL`) |
| `migrate:generate` | Generate SQL from Drizzle schema |
| `load:au` | Load AU ABS CPI fixture |
| `load:us` | Load US BLS CPI-U fixture |
| `check:freshness` | Print freshness report |
| `build` | Compile TypeScript to `dist/` |

Examples (repo root):

```bash
bun install
bun run --filter @inflationmonitor/data test
bun run --filter @inflationmonitor/data migrate
bun run --filter @inflationmonitor/data load:au
bun run --filter @inflationmonitor/data load:us
```

Workspace-aware clients can also run the `test` / `migrate` / `load:*` scripts on `@inflationmonitor/data` via `-w` / `--workspace`.

## Tests / database choice

There is **no Docker socket and no local `psql`** on the build box, and `DATABASE_URL` may be unset.

Tests use **[@electric-sql/pglite](https://github.com/electric-sql/pglite)** (Postgres compiled to WASM) so schema DDL, FKs, unique indexes, and identity columns are validated with real Postgres SQL semantics — without Docker or Neon.

Production / CLI paths still use `DATABASE_URL` via `postgres.js` + Drizzle.

## Layout

- `src/schema` — Drizzle table definitions
- `drizzle/` — SQL migrations
- `src/loaders` — AU ABS CPI, US BLS CPI-U
- `src/freshness` — stale/missing latest-period checks
- `fixtures/` — mock ABS/BLS payloads for tests and local loads
- `SCHEMA.md` — table + series id reference
