/**
 * Context Type Definitions
 * Based on: https://moleculer.services/docs/0.14/context
 */

import { type GenericObject, Context as MoleculerContext } from "moleculer";

/**
 * Context - Carries request information
 *
 * When you call an action or emit an event, the broker creates a Context instance
 * which contains all request information and passes it to the action/event handler.
 *
 * @typeParam P - Parameters type
 * @typeParam M - Meta type
 *
 * @see https://moleculer.services/docs/0.14/context
 *
 * @example
 * ```typescript
 * import { Context } from "core.lib/moleculer";
 *
 * interface AddParams {
 *   a: number;
 *   b: number;
 * }
 *
 * const action = {
 *   add(ctx: Context<AddParams>) {
 *     return ctx.params.a + ctx.params.b;
 *   }
 * };
 * ```
 */
export type Context<
  P = GenericObject,
  M extends object = GenericObject,
> = MoleculerContext<P, M>;

/**
 * Type helper for action handlers
 */
export type ActionHandler<
  P = GenericObject,
  M extends object = GenericObject,
  R = unknown,
> = (ctx: Context<P, M>) => Promise<R> | R;

/**
 * Type helper for event handlers
 */
export type EventHandler<
  P = GenericObject,
  M extends object = GenericObject,
> = (ctx: Context<P, M>) => Promise<void> | void;

// Re-export the original for compatibility
export { MoleculerContext };
