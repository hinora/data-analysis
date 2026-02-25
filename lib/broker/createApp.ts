/**
 * Create App - Creates a Moleculer broker and loads services automatically
 */

// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as fs from "fs";
import type { ActionSchema, ServiceEvent, ServiceSchema } from "moleculer";
// biome-ignore lint/style/useNodejsImportProtocol: ignore
import * as path from "path";
import { defineConfig } from "../config";
import { ServiceBroker } from "../moleculer";
import type { ActionDefinition, AppOptions, EventDefinition } from "./types";

/**
 * Loads service configuration from index.ts/index.js if it exists
 * This allows defining service settings, hooks, metadata, etc.
 * @see https://moleculer.services/docs/0.14/services
 */
function loadServiceConfig(
  serviceActionsPath: string,
  serviceName: string,
): Partial<ServiceSchema> {
  const indexTsPath = path.join(serviceActionsPath, "index.ts");
  const indexJsPath = path.join(serviceActionsPath, "index.js");

  const configPath = fs.existsSync(indexTsPath)
    ? indexTsPath
    : fs.existsSync(indexJsPath)
      ? indexJsPath
      : null;

  if (!configPath) {
    return { name: serviceName };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const configModule = require(configPath);
    const config: Partial<ServiceSchema> = configModule.default || configModule;

    // Ensure the service name is set (use config name if provided, otherwise folder name)
    return {
      ...config,
      name: config.name || serviceName,
    };
  } catch (error) {
    console.error(`Failed to load service config ${configPath}:`, error);
    return { name: serviceName };
  }
}

/**
 * Scans the services folder and builds service schemas
 * Structure: /services/{serviceName}/{actionName}.action.ts
 *           /services/{serviceName}/{eventName}.event.ts
 *
 * If an index.ts file exists in the service directory, it will be used as
 * the service configuration (settings, hooks, metadata, dependencies, etc.)
 * @see https://moleculer.services/docs/0.14/services
 */
function loadServicesFromPath(servicesPath: string): ServiceSchema[] {
  const services: Map<string, ServiceSchema> = new Map();

  if (!fs.existsSync(servicesPath)) {
    console.warn(`Services path does not exist: ${servicesPath}`);
    return [];
  }

  // Get all service directories
  const serviceDirs = fs.readdirSync(servicesPath, { withFileTypes: true });

  for (const serviceDir of serviceDirs) {
    if (!serviceDir.isDirectory()) continue;

    const serviceName = serviceDir.name;
    const serviceActionsPath = path.join(servicesPath, serviceName);

    // Get all action files in the service directory
    const actionFiles = fs
      .readdirSync(serviceActionsPath)
      .filter(
        (file) => file.endsWith(".action.ts") || file.endsWith(".action.js"),
      );

    // Get all event files in the service directory
    const eventFiles = fs
      .readdirSync(serviceActionsPath)
      .filter(
        (file) => file.endsWith(".event.ts") || file.endsWith(".event.js"),
      );

    // Load service configuration from index.ts if it exists
    const serviceConfig = loadServiceConfig(serviceActionsPath, serviceName);

    // Create service schema by merging config with auto-loaded actions and events
    const serviceSchema: ServiceSchema = {
      ...serviceConfig,
      name: serviceConfig.name || serviceName,
      actions: {
        // Include any actions defined in the config file
        ...(serviceConfig.actions || {}),
      },
      events: {
        // Include any events defined in the config file
        ...(serviceConfig.events || {}),
      },
    };

    for (const actionFile of actionFiles) {
      // Extract action name from filename (e.g., "login.action.ts" -> "login")
      const actionName = actionFile.replace(/\.action\.(ts|js)$/, "");
      const actionPath = path.join(serviceActionsPath, actionFile);

      try {
        // Dynamic import of the action file
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const actionModule = require(actionPath);
        const actionDef: ActionDefinition =
          actionModule.default || actionModule;

        if (actionDef && typeof actionDef.handler === "function") {
          if (serviceSchema.actions === undefined) {
            serviceSchema.actions = {};
          }
          serviceSchema.actions[actionName] =
            actionDef as unknown as ActionSchema;
        } else {
          console.warn(
            `Invalid action definition in ${actionPath}: missing handler function`,
          );
        }
      } catch (error) {
        console.error(`Failed to load action ${actionPath}:`, error);
      }
    }

    // Load event files
    for (const eventFile of eventFiles) {
      // Extract event name from filename (e.g., "userCreated.event.ts" -> "userCreated")
      const eventName = eventFile.replace(/\.event\.(ts|js)$/, "");
      const eventPath = path.join(serviceActionsPath, eventFile);

      try {
        // Dynamic import of the event file
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const eventModule = require(eventPath);
        const eventDef: EventDefinition = eventModule.default || eventModule;

        if (eventDef && typeof eventDef.handler === "function") {
          if (serviceSchema.events === undefined) {
            serviceSchema.events = {};
          }
          // Use format "serviceName.eventName" for full event name
          const fullEventName = `${serviceName}.${eventName}`;
          serviceSchema.events[fullEventName] =
            eventDef as unknown as ServiceEvent;
        } else {
          console.warn(
            `Invalid event definition in ${eventPath}: missing handler function`,
          );
        }
      } catch (error) {
        console.error(`Failed to load event ${eventPath}:`, error);
      }
    }

    // Only add service if it has actions OR events OR has other config
    const hasActions = Object.keys(serviceSchema.actions ?? {}).length > 0;
    const hasEvents = Object.keys(serviceSchema.events ?? {}).length > 0;
    const hasOtherConfig =
      serviceConfig.events ||
      serviceConfig.methods ||
      serviceConfig.hooks ||
      serviceConfig.settings ||
      serviceConfig.dependencies;

    if (hasActions || hasEvents || hasOtherConfig) {
      services.set(serviceName, serviceSchema);
    }
  }

  return Array.from(services.values());
}

/**
 * Creates a Moleculer application that automatically loads services
 *
 * @param options - App configuration options (merged with defaults)
 * @returns Object with broker instance and start/stop methods
 *
 * @example
 * ```typescript
 * // app.ts
 * import { createApp } from "core.lib/broker";
 * import config from "./moleculer.config";
 *
 * const app = createApp(config);
 * app.start().catch(console.error);
 * ```
 */
export function createApp(options: Partial<AppOptions> = {}) {
  // Merge with default config
  const config = defineConfig(options);
  const { servicesPath = "./services", ...brokerOptions } = config;

  // Resolve the services path relative to the caller's directory
  const resolvedServicesPath = path.resolve(process.cwd(), servicesPath);

  // Create the broker
  const broker = new ServiceBroker(brokerOptions);

  // Load and create services
  const serviceSchemas = loadServicesFromPath(resolvedServicesPath);

  for (const schema of serviceSchemas) {
    broker.createService(schema);
  }

  return {
    /** The underlying Moleculer ServiceBroker instance */
    broker,

    /** Number of loaded services */
    serviceCount: serviceSchemas.length,

    /** Names of loaded services */
    serviceNames: serviceSchemas.map((s) => s.name),

    /**
     * Start the broker and all services
     */
    async start() {
      console.log(`Starting app with ${serviceSchemas.length} service(s)...`);
      await broker.start();
      return broker;
    },

    /**
     * Stop the broker and all services
     */
    async stop() {
      await broker.stop();
    },

    /**
     * Call a service action
     */
    call: broker.call.bind(broker),

    /**
     * Emit an event
     */
    emit: broker.emit.bind(broker),

    /**
     * Broadcast an event
     */
    broadcast: broker.broadcast.bind(broker),
  };
}

/**
 * App instance type
 */
export type App = ReturnType<typeof createApp>;
