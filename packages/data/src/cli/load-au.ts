import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, requireDatabaseUrl } from "../db/client.js";
import { applySchema } from "../db/migrate.js";
import { loadAuAbsCpi, loadAuAbsFixture } from "../loaders/au-abs-cpi.js";
import { fetchAuAbsCpiLive } from "../loaders/fetch-au-abs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function wantsLive(argv: string[]): boolean {
  return argv.includes("--live") || argv.includes("live");
}

async function main() {
  const argv = process.argv.slice(2);
  const live = wantsLive(argv);
  const fixturePath =
    argv.find((a) => !a.startsWith("-") && a !== "live") ??
    path.resolve(__dirname, "../../fixtures/au-abs/cpi-headline.json");

  const { db, client } = createDb(requireDatabaseUrl());
  try {
    await applySchema(db);
    const fixture = live
      ? await fetchAuAbsCpiLive()
      : await loadAuAbsFixture(fixturePath);
    if (live && "fetchMeta" in fixture) {
      console.error(
        JSON.stringify({ mode: "live", fetchMeta: fixture.fetchMeta }, null, 2),
      );
    }
    const result = await loadAuAbsCpi(db, fixture);
    console.log(JSON.stringify({ mode: live ? "live" : "fixture", ...result }, null, 2));
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
