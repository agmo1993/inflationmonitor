import { AU, US_SERIES_LIST } from "../catalog/series-ids.js";
import { createDb, requireDatabaseUrl } from "../db/client.js";
import { checkFreshness } from "../freshness/check.js";

async function main() {
  const seriesIds = [AU.headline.id, ...US_SERIES_LIST.map((s) => s.id)];
  const { db, client } = createDb(requireDatabaseUrl());
  try {
    const report = await checkFreshness(db, seriesIds);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 2;
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
