/**
 * Auth Microservice
 */
import "dotenv/config";
import { createApp, run } from "core.lib/broker";
import { dataSource } from "./db";
import createConfig from "./moleculer.config";

async function main() {
  // Initialise database before starting broker
  await dataSource.initialize();
  console.log("✅ auth_db connected");

  const config = createConfig();
  const app = createApp(config);
  run(app.broker);
}

main().catch((err) => {
  console.error("❌ Failed to start auth microservice:", err);
  process.exit(1);
});
