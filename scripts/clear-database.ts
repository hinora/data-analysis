/**
 * Clear Database Script
 *
 * Deletes all data from all local MongoDB databases used by the application.
 * Usage: npm run db:clear
 */

import "dotenv/config";
import mongoose from "mongoose";

// Database names used by the application
const DATABASES = ["analysisDb", "aiDb", "newsDb", "schedulerDb", "stockDb"];

async function clearDatabase(): Promise<void> {
  const host = process.env.MONGODB_HOST || "localhost";
  const port = process.env.MONGODB_PORT || "27017";
  const baseUri = `mongodb://${host}:${port}`;

  console.log("🗑️  Clearing all databases...\n");

  for (const dbName of DATABASES) {
    try {
      const uri = `${baseUri}/${dbName}`;
      const connection = await mongoose.createConnection(uri).asPromise();

      // Drop the entire database
      await connection.dropDatabase();
      console.log(`✅ Dropped database: ${dbName}`);

      await connection.close();
    } catch (error) {
      const err = error as Error;
      console.error(`❌ Error dropping ${dbName}: ${err.message}`);
    }
  }

  console.log("\n✨ Database cleanup complete!");
  process.exit(0);
}

clearDatabase().catch((err: Error) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
