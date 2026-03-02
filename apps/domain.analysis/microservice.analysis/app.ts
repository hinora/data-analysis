/**
 * Analysis Microservice
 */
import "dotenv/config";
import { createApp, run } from "core.lib/broker";
import { validateAIProvider } from "core.lib/config";
import { dataSource } from "./db";
import createConfig from "./moleculer.config";

async function main() {
  // Fail-fast: validate AI provider configuration before anything else
  validateAIProvider();

  // Initialise database before starting broker
  await dataSource.initialize();
  console.log("✅ analysis_db connected");

  const config = createConfig();
  const app = createApp(config);
  run(app.broker);
}

main().catch((err) => {
  console.error("❌ Failed to start analysis microservice:", err);
  process.exit(1);
});
