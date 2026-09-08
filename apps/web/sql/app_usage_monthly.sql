-- App-owned metering tables. Namespaced with app_ prefix so they never collide
-- with CPI schema objects owned by packages/data (country, source, series, …).

CREATE TABLE IF NOT EXISTS app_usage_monthly (
  account_id  TEXT           NOT NULL,
  year_month  TEXT           NOT NULL, -- UTC calendar month as YYYY-MM
  spend_usd   NUMERIC(12, 6) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, year_month)
);

-- Idempotent spend increments: duplicate keys are no-ops (do not double-bill).
CREATE TABLE IF NOT EXISTS app_usage_ledger (
  idempotency_key TEXT           PRIMARY KEY,
  account_id      TEXT           NOT NULL,
  year_month      TEXT           NOT NULL,
  amount_usd      NUMERIC(12, 6) NOT NULL,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_usage_ledger_account_ym_idx
  ON app_usage_ledger (account_id, year_month);
