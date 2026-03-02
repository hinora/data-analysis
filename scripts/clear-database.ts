/**
 * Clear Database Script
 *
 * Truncates all tables in all local PostgreSQL databases used by the application.
 * Preserves schema structure (tables, indexes, extensions, etc.) while removing all data.
 * Usage: npm run db:clear
 */

import "dotenv/config";
import { Client } from "pg";

// Database names used by the application
const DATABASES = ["analysis_db", "data_db"];

async function clearDatabase(): Promise<void> {
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = process.env.POSTGRES_PORT || "5432";
  const user = process.env.POSTGRES_USER || "postgres";
  const password = process.env.POSTGRES_PASSWORD || "postgres";

  console.log("🗑️  Clearing all table data...\n");

  for (const dbName of DATABASES) {
    const client = new Client({
      host,
      port: Number(port),
      user,
      password,
      database: dbName,
    });

    try {
      await client.connect();

      // Get all table names in the public schema
      const result = await client.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
      );
      const tables = result.rows.map((row) => row.tablename);

      if (tables.length === 0) {
        console.log(`⚠️  No tables found in: ${dbName}`);
        continue;
      }

      // Truncate all tables with CASCADE to handle foreign key constraints, and reset identity columns
      const tableList = tables.map((t) => `"${t}"`).join(", ");
      await client.query(
        `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
      );

      console.log(`✅ Cleared ${tables.length} table(s) in: ${dbName}`);
    } catch (error) {
      const err = error as Error;
      console.error(`❌ Error clearing ${dbName}: ${err.message}`);
    } finally {
      await client.end();
    }
  }

  console.log("\n✨ Database cleanup complete!");
  process.exit(0);
}

clearDatabase().catch((err: Error) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
