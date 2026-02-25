/**
 * Example Microservice
 */
import "dotenv/config";
import { createApp, run } from "core.lib/broker";
import createConfig from "./moleculer.config";

// Create config fresh each time (picks up latest defaults)
const config = createConfig();

const app = createApp(config);
run(app.broker);
