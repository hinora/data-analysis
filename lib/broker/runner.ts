/**
 * Custom Moleculer Runner
 * Keeps the service running and handles graceful shutdown
 */

import type { ServiceBroker } from "../moleculer";

/**
 * Signal handlers for graceful shutdown
 */
const stopSignals: NodeJS.Signals[] = [
  "SIGHUP",
  "SIGINT",
  "SIGQUIT",
  "SIGTERM",
];

export interface RunnerOptions {
  /**
   * Enable REPL mode for debugging
   * @default true in development mode (NODE_ENV=development or unset)
   * @default false in production mode
   */
  repl?: boolean;
}

/**
 * Runner class that keeps the broker running
 */
export class Runner {
  private broker: ServiceBroker;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(broker: ServiceBroker) {
    this.broker = broker;
  }

  /**
   * Start the broker and keep it running
   */
  async start(options: RunnerOptions = {}): Promise<ServiceBroker> {
    // Start the broker
    await this.broker.start();

    // Keep the event loop alive
    this.keepAliveTimer = setInterval(
      () => {
        // This interval keeps Node.js running
      },
      1000 * 60 * 60,
    ); // 1 hour interval (just to keep alive, doesn't need to run often)

    // Make the timer not prevent the process from exiting when we want it to
    this.keepAliveTimer.unref();

    // But we need at least one ref to keep alive, so let's ref it back
    this.keepAliveTimer.ref();

    // Register signal handlers
    this.registerSignalHandlers();

    // Enable REPL in development mode by default, or if explicitly requested
    const nodeEnv = process.env.NODE_ENV;
    const isDevelopment = nodeEnv === "development" || !nodeEnv;
    const enableRepl = options.repl ?? isDevelopment;

    console.log(`\n🚀 Service broker started. Node ID: ${this.broker.nodeID}`);

    if (enableRepl) {
      console.log("   REPL console enabled. Type 'help' for commands.\n");
      this.broker.repl();
    } else {
      console.log("   Press Ctrl+C to stop.\n");
    }

    return this.broker;
  }

  /**
   * Stop the broker gracefully
   */
  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;

    console.log("\n⏳ Shutting down...");

    // Clear the keep-alive timer
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    try {
      await this.broker.stop();
      console.log("✅ Service broker stopped gracefully.");
    } catch (err) {
      console.error("❌ Error during shutdown:", err);
    }

    process.exit(0);
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  private registerSignalHandlers(): void {
    stopSignals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(`\nReceived ${signal}`);
        await this.stop();
      });
    });

    // Handle uncaught errors
    process.on("uncaughtException", async (err) => {
      console.error("Uncaught Exception:", err);
      await this.stop();
    });

    process.on("unhandledRejection", async (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
      // Don't exit on unhandled rejection, just log it
    });
  }
}

/**
 * Create and start a runner for a broker
 *
 * @param broker - The ServiceBroker instance to run
 * @param options - Runner options
 * @returns Promise that resolves when broker is started
 *
 * @example
 * ```typescript
 * import { createApp, run } from "core.lib/broker";
 * import config from "./moleculer.config";
 *
 * const app = createApp(config);
 * run(app.broker);
 * ```
 */
export function run(
  broker: ServiceBroker,
  options: RunnerOptions = {},
): Promise<ServiceBroker> {
  const runner = new Runner(broker);
  return runner.start(options);
}
