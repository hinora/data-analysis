/**
 * Auth Microservice
 *
 * Handles user registration, login, token verification,
 * and profile management.
 */

process.env.TZ = "UTC";

import "dotenv/config";
import { createApp, run } from "core.lib/broker";
import { dataSource } from "./db";
import createConfig from "./moleculer.config";

async function main() {
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
