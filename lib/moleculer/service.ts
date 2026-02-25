/**
 * Service Type Definitions
 * Based on: https://moleculer.services/docs/0.14/services
 */

import {
  ActionSchema,
  Service as MoleculerService,
  ServiceSchema as MoleculerServiceSchema,
  ServiceEvent,
  ServiceSettingSchema,
} from "moleculer";

import { ActionHandler, EventHandler } from "./context";

/**
 * Service - Represents a Moleculer microservice
 * Re-exported from moleculer with documentation
 *
 * @see https://moleculer.services/docs/0.14/services
 */
export type Service<S = ServiceSettingSchema> = MoleculerService<S>;

/**
 * ServiceSchema - Schema definition for a service
 * Re-exported from moleculer with documentation
 *
 * @see https://moleculer.services/docs/0.14/services
 *
 * @example
 * ```typescript
 * import { ServiceSchema, Context } from "core.lib/moleculer";
 *
 * const schema: ServiceSchema = {
 *   name: "users",
 *   version: 1,
 *
 *   settings: {
 *     defaultLimit: 10
 *   },
 *
 *   actions: {
 *     list: {
 *       params: {
 *         limit: { type: "number", optional: true }
 *       },
 *       async handler(ctx) {
 *         return [];
 *       }
 *     }
 *   },
 *
 *   created() {
 *     this.logger.info("Service created");
 *   },
 *
 *   async started() {
 *     this.logger.info("Service started");
 *   },
 *
 *   async stopped() {
 *     this.logger.info("Service stopped");
 *   }
 * };
 * ```
 */
export type ServiceSchema<S = ServiceSettingSchema> = MoleculerServiceSchema<S>;

/**
 * Partial service schema for use with defineService
 * The `name` property is optional because it's derived from the folder structure
 */
export type PartialServiceSchema<S = ServiceSettingSchema> = Omit<
  MoleculerServiceSchema<S>,
  "name"
> & { name?: string };

/**
 * Helper function to define a service schema with proper typing.
 * The `name` property is optional - if omitted, it will be derived from the folder name.
 *
 * @example
 * ```typescript
 * import { defineService } from "core.lib/broker";
 *
 * // Name auto-derived from folder (e.g., services/user/ -> "user")
 * export default defineService({
 *   settings: {
 *     rest: "/users",
 *   },
 * });
 *
 * // Or with explicit name
 * export default defineService({
 *   name: "math",
 *   actions: {
 *     add(ctx: Context<{ a: number; b: number }>) {
 *       return ctx.params.a + ctx.params.b;
 *     }
 *   }
 * });
 * ```
 */
export function defineService<S = ServiceSettingSchema>(
  schema: PartialServiceSchema<S>,
): PartialServiceSchema<S> {
  return schema;
}

// Re-export types from moleculer
export {
  MoleculerService,
  MoleculerServiceSchema,
  ActionSchema,
  ServiceEvent,
  ServiceSettingSchema,
  ActionHandler,
  EventHandler,
};
