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

  // Ensure embedding column is native vector type (migrate from text/varchar if needed)
  const columnType = await dataSource.query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'textChunks' AND column_name = 'embedding'
  `);
  if (columnType.length > 0 && columnType[0].data_type !== "USER-DEFINED") {
    console.log(
      `⏳ Migrating embedding column from ${columnType[0].data_type} to vector(768)...`,
    );
    await dataSource.query(`
      ALTER TABLE "textChunks"
      ALTER COLUMN embedding TYPE vector(768)
      USING embedding::vector(768)
    `);
    console.log("✅ Embedding column migrated to vector(768)");
  }

  // Create HNSW index for fast cosine similarity search if not exists
  await dataSource.query(`
    CREATE INDEX IF NOT EXISTS idx_textChunks_embedding_hnsw
    ON "textChunks"
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);

  console.log("✅ data_db connected (pgvector enabled, HNSW index ready)");

  const config = createConfig();
  const app = createApp(config);
  run(app.broker);
}

main().catch((err) => {
  console.error("❌ Failed to start data microservice:", err);
  process.exit(1);
});
