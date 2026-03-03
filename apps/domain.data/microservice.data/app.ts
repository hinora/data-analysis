/**
 * Data Microservice
 */

// Force UTC so that Date serialisation and pg driver timestamps are
// always in UTC, preventing double-offset issues in non-UTC environments.
process.env.TZ = "UTC";

import "dotenv/config";
import { createApp, run } from "core.lib/broker";
import { validateAIProvider } from "core.lib/config";
import { dataSource } from "./db";
import createConfig from "./moleculer.config";

async function main() {
  // Fail-fast: validate AI provider configuration before anything else
  validateAIProvider();

  // Initialise database (+ pgvector extension) before starting broker
  await dataSource.initialize();

  // Create pgvector extension if not exists
  await dataSource.query("CREATE EXTENSION IF NOT EXISTS vector");

  console.log("✅ data_db connected (pgvector enabled)");

  const config = createConfig();
  const app = createApp(config);
  run(app.broker);
}

main().catch((err) => {
  console.error("❌ Failed to start data microservice:", err);
  process.exit(1);
});
