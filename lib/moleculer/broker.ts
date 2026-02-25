/**
 * ServiceBroker Type Definitions
 * Based on: https://moleculer.services/docs/0.14/broker
 */

import {
  type GenericObject,
  BrokerOptions as MoleculerBrokerOptions,
  ServiceBroker as MoleculerServiceBroker,
} from "moleculer";

/**
 * BrokerOptions - Configuration options for ServiceBroker
 * Re-exported from moleculer with documentation
 *
 * @see https://moleculer.services/docs/0.14/broker
 */
export type BrokerOptions = MoleculerBrokerOptions;

/**
 * Ping response from a single node
 */
export interface PingResponse {
  /** Node ID of the responding node */
  nodeID: string;
  /** Round-trip time in milliseconds */
  elapsedTime: number;
  /** System clock difference between nodes */
  timeDiff: number;
}

/**
 * Ping responses from multiple nodes
 */
export type PingResponses = Record<string, PingResponse>;

/**
 * Error handler info passed to the global error handler
 */
export interface BrokerErrorHandlerInfo {
  /** The broker instance */
  broker: ServiceBroker;
  /** The service instance (if error occurred in a service) */
  service?: unknown;
  /** The context (if error occurred during action/event handling) */
  ctx?: unknown;
  /** Action definition (if error occurred during action handling) */
  action?: GenericObject;
  /** Event definition (if error occurred during event handling) */
  event?: GenericObject;
}

/**
 * ServiceBroker - The main component of Moleculer
 *
 * It handles services, calls actions, emits events and communicates with remote nodes.
 * You must create a ServiceBroker instance on every node.
 *
 * Re-exported from moleculer with documentation.
 *
 * @see https://moleculer.services/docs/0.14/broker
 *
 * @example
 * ```typescript
 * import { ServiceBroker } from "core.lib/moleculer";
 *
 * const broker = new ServiceBroker({
 *   nodeID: "my-node",
 *   transporter: "NATS",
 *   logLevel: "info"
 * });
 *
 * await broker.start();
 * ```
 */
export const ServiceBroker = MoleculerServiceBroker;
export type ServiceBroker = MoleculerServiceBroker;

// Re-export the original for compatibility
export { MoleculerServiceBroker, MoleculerBrokerOptions };
