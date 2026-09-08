import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, requireDatabaseUrl } from "../db/client.js";
import { applySchema } from "../db/migrate.js";
import { loadUsBlsCpi, loadUsBlsFixture } from "../loaders/us-bls-cpi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const fixturePath =
    process.argv[2] ??
    path.resolve(__dirname, "../../fixtures/us-bls/cpiu-components.json");
  const { db, client } = createDb(requireDatabaseUrl());
  try {
    await applySchema(db);
    const fixture = await loadUsBlsFixture(fixturePath);
    const result = await loadUsBlsCpi(db, fixture);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
