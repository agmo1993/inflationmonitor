import type { UsageStore } from "../metering/usage-store";
import { getSql } from "./client";

/**
 * Postgres-backed UsageStore using app_usage_monthly + app_usage_ledger.
 * Run sql/app_usage_monthly.sql once against DATABASE_URL before first use.
 */
export function createPostgresUsageStore(): UsageStore {
  return {
    async getSpend(accountId, yearMonth) {
      const sql = getSql();
      const rows = await sql<{ spend_usd: string }[]>`
        SELECT spend_usd::text AS spend_usd
        FROM app_usage_monthly
        WHERE account_id = ${accountId} AND year_month = ${yearMonth}
        LIMIT 1
      `;
      if (rows.length === 0) return 0;
      return Number(rows[0].spend_usd);
    },

    async incrementSpend(accountId, yearMonth, amountUsd, idempotencyKey) {
      const sql = getSql();

      return await sql.begin(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx<{ amount_usd: string }[]>`
            SELECT amount_usd::text AS amount_usd
            FROM app_usage_ledger
            WHERE idempotency_key = ${idempotencyKey}
            LIMIT 1
          `;
          if (existing.length > 0) {
            const rows = await tx<{ spend_usd: string }[]>`
              SELECT spend_usd::text AS spend_usd
              FROM app_usage_monthly
              WHERE account_id = ${accountId} AND year_month = ${yearMonth}
              LIMIT 1
            `;
            return rows.length ? Number(rows[0].spend_usd) : 0;
          }

          await tx`
            INSERT INTO app_usage_ledger (idempotency_key, account_id, year_month, amount_usd)
            VALUES (${idempotencyKey}, ${accountId}, ${yearMonth}, ${amountUsd})
          `;
        }

        const rows = await tx<{ spend_usd: string }[]>`
          INSERT INTO app_usage_monthly (account_id, year_month, spend_usd, updated_at)
          VALUES (${accountId}, ${yearMonth}, ${amountUsd}, now())
          ON CONFLICT (account_id, year_month) DO UPDATE
            SET spend_usd = app_usage_monthly.spend_usd + EXCLUDED.spend_usd,
                updated_at = now()
          RETURNING spend_usd::text AS spend_usd
        `;
        return Number(rows[0].spend_usd);
      });
    },
  };
}
