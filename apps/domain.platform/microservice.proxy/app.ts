/**
 * Proxy Microservice - API Gateway
 * Exposes internal services via HTTP using moleculer-web
 */
import "dotenv/config";
import { ServiceBroker } from "moleculer";
import createConfig from "./moleculer.config";
import ApiGatewayService from "./services/api/gateway.service";

async function main(): Promise<void> {
  const config = createConfig();

  // Create broker with configuration
  const broker = new ServiceBroker(config);

  // Create the API Gateway service
  broker.createService(ApiGatewayService);

  // Start the broker
  await broker.start();

  // Graceful shutdown
  const gracefulShutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    await broker.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

main().catch((err: Error) => {
  console.error(`Error occurred! ${err.message}`);
  process.exit(1);
});
