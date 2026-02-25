/**
 * Broker Types
 */

import {
  type ActionCacheOptions,
  type ActionHooks,
  type ActionVisibility,
  type BrokerCircuitBreakerOptions,
  type BulkheadOptions,
  Errors,
  type FallbackHandler,
  type RestSchema,
  type RetryPolicyOptions,
  type Service,
  type TracingActionOptions,
} from "moleculer";
import type { AppConfig } from "../config";
import type { Context } from "../moleculer";
import type { ParamsSchema } from "./validation";

/**
 * Authenticated user metadata added by authentication hook
 */
export interface AuthenticatedUser {
  email: string;
  id: string;
  isActive: boolean;
  isVerified: boolean;
  nickName: string;
  photo?: string;
}

/**
 * Context with authenticated user in meta.
 * Used when action has `authentication: true`
 */
export interface AuthenticatedContext<P = unknown> extends Context<P> {
  meta: Context<P>["meta"] & { user: AuthenticatedUser };
}

/**
 * Base action definition without authentication
 */
interface BaseActionDefinition {
  /** Action name */
  name?: string;
  /** REST endpoint mapping */
  rest?: RestSchema | RestSchema[] | string | string[];
  /** Action visibility */
  visibility?: ActionVisibility;
  /** Action parameters validation schema (fastest-validator) */
  params?: ParamsSchema;
  /** Service reference */
  service?: Service;
  /** Action cache settings */
  cache?: boolean | ActionCacheOptions;
  /** Tracing options */
  tracing?: boolean | TracingActionOptions;
  /** Bulkhead options */
  bulkhead?: BulkheadOptions;
  /** Circuit breaker options */
  circuitBreaker?: BrokerCircuitBreakerOptions;
  /** Retry policy options */
  retryPolicy?: RetryPolicyOptions;
  /** Fallback handler */
  fallback?: string | FallbackHandler;
  /** Action hooks */
  hooks?: ActionHooks;
}

/**
 * Action definition with authentication enabled.
 * Handler receives AuthenticatedContext with typed meta.user
 */
export interface AuthenticatedActionDefinition<P = unknown, R = unknown>
  extends BaseActionDefinition {
  /** Enable authentication - handler receives AuthenticatedContext */
  authentication: true;
  /** Action handler with authenticated context */
  handler: (ctx: AuthenticatedContext<P>) => Promise<R> | R;
}

/**
 * Action definition without authentication.
 * Handler receives standard Context
 */
export interface PublicActionDefinition<P = unknown, R = unknown>
  extends BaseActionDefinition {
  /** Authentication disabled or not specified */
  authentication?: false;
  /** Action handler with standard context */
  handler: (ctx: Context<P>) => Promise<R> | R;
}

/**
 * Action definition exported from an action file
 * Based on Moleculer's ActionSchema but with typed handler
 */
export type ActionDefinition<P = unknown, R = unknown> =
  | AuthenticatedActionDefinition<P, R>
  | PublicActionDefinition<P, R>;

/**
 * App configuration options (alias for AppConfig)
 */
export type AppOptions = AppConfig;

/**
 * Helper to define an action with proper typing.
 * When `authentication: true`, handler receives `AuthenticatedContext` with typed `ctx.meta.user`.
 *
 * @example
 * ```typescript
 * // Public action (no authentication)
 * export default defineAction<LoginParams, LoginResult>({
 *   rest: "POST /login",
 *   async handler(ctx) {
 *     const { email, password } = ctx.params;
 *     return { token: "...", user: { id: "1", email } };
 *   }
 * });
 *
 * // Protected action (with authentication)
 * export default defineAction<GetProfileParams, GetProfileResult>({
 *   authentication: true,
 *   rest: "GET /profile",
 *   async handler(ctx) {
 *     // ctx.meta.user is typed as AuthenticatedUser
 *     return { email: ctx.meta.user.email };
 *   }
 * });
 * ```
 */
export function defineAction<P = unknown, R = unknown>(
  action: AuthenticatedActionDefinition<P, R>,
): AuthenticatedActionDefinition<P, R>;
export function defineAction<P = unknown, R = unknown>(
  action: PublicActionDefinition<P, R>,
): PublicActionDefinition<P, R>;
export function defineAction<P = unknown, R = unknown>(
  action: ActionDefinition<P, R>,
): ActionDefinition<P, R> {
  // If authentication is enabled, add before hook to verify token
  if (action.authentication) {
    const existingHooks = action.hooks || {};
    const existingBeforeHook = existingHooks.before;

    // Create authentication before hook
    const authenticationHook = async (ctx: Context<P>): Promise<void> => {
      // Skip authentication for internal service-to-service calls
      // ctx.caller contains the calling service name
      // If caller is "proxy" (gateway), it's an external request - require authentication
      // If caller is any other service, it's an internal call - skip authentication
      if (ctx?.caller !== "proxy") {
        return;
      }

      const token = (ctx.meta as Record<string, unknown>).token as
        | string
        | undefined;

      if (!token) {
        throw new Errors.MoleculerClientError(
          "Authentication required: No token provided",
          401,
          "ERR_NO_TOKEN",
        );
      }

      try {
        // Call verifyToken action to validate token and get user
        const result = await ctx.call<
          { user: AuthenticatedUser; valid: true },
          { token: string }
        >("auth.verifyToken", { token });

        // Assign user to ctx.meta
        (ctx.meta as Record<string, unknown>).user = result.user;
      } catch (err) {
        // Re-throw as 401 if it's a token validation error
        if (err instanceof Errors.MoleculerError) {
          throw err;
        }
        throw new Errors.MoleculerClientError(
          err instanceof Error ? err.message : "Invalid or expired token",
          401,
          "ERR_INVALID_TOKEN",
        );
      }
    };

    // Merge with existing before hooks
    const beforeHooks: Array<(ctx: Context<P>) => Promise<void> | void> = [
      authenticationHook,
    ];

    if (existingBeforeHook) {
      if (Array.isArray(existingBeforeHook)) {
        beforeHooks.push(
          ...(existingBeforeHook as Array<
            (ctx: Context<P>) => Promise<void> | void
          >),
        );
      } else if (typeof existingBeforeHook === "function") {
        beforeHooks.push(
          existingBeforeHook as (ctx: Context<P>) => Promise<void> | void,
        );
      }
    }

    action.hooks = {
      ...existingHooks,
      before: beforeHooks as unknown as ActionHooks["before"],
    };
  }

  return action;
}

// ============================================================================
// Event Definition Types
// ============================================================================

/**
 * Event group configuration for grouping events together.
 * Used with load balancing across service instances.
 * @see https://moleculer.services/docs/0.14/events#context
 */
export interface EventGroup {
  /**
   * Group name for load balancing.
   * Events with the same group are load-balanced,
   * only one instance per group receives the event.
   */
  group?: string;
}

/**
 * Base event definition shared by all event types
 */
interface BaseEventDefinition {
  /**
   * Event group name for load balancing.
   * If set, only one service instance per group receives the event.
   * @see https://moleculer.services/docs/0.14/events#grouping
   */
  group?: string;
}

/**
 * Event definition with authentication enabled.
 * Handler receives AuthenticatedContext with typed meta.user
 */
export interface AuthenticatedEventDefinition<P = unknown>
  extends BaseEventDefinition {
  /** Enable authentication - handler receives AuthenticatedContext */
  authentication: true;
  /** Event handler with authenticated context */
  handler: (ctx: AuthenticatedContext<P>) => Promise<void> | void;
}

/**
 * Event definition without authentication.
 * Handler receives standard Context
 */
export interface PublicEventDefinition<P = unknown>
  extends BaseEventDefinition {
  /** Authentication disabled or not specified */
  authentication?: false;
  /** Event handler with standard context */
  handler: (ctx: Context<P>) => Promise<void> | void;
}

/**
 * Event definition exported from an event file.
 * Based on Moleculer's ServiceEvent but with typed handler.
 * @see https://moleculer.services/docs/0.14/events
 */
export type EventDefinition<P = unknown> =
  | AuthenticatedEventDefinition<P>
  | PublicEventDefinition<P>;

/**
 * Helper to define an event with proper typing.
 * Events are used for async, fire-and-forget communication.
 *
 * @see https://moleculer.services/docs/0.14/events
 *
 * @example
 * ```typescript
 * // Basic event handler
 * export default defineEvent<UserCreatedPayload>({
 *   async handler(ctx) {
 *     const { userId, email } = ctx.params;
 *     // Send welcome email, update analytics, etc.
 *   }
 * });
 *
 * // Event with load-balanced group
 * export default defineEvent<OrderPlacedPayload>({
 *   group: "order-processors",
 *   async handler(ctx) {
 *     // Only one service instance in this group receives the event
 *   }
 * });
 * ```
 */
export function defineEvent<P = unknown>(
  event: AuthenticatedEventDefinition<P>,
): AuthenticatedEventDefinition<P>;
export function defineEvent<P = unknown>(
  event: PublicEventDefinition<P>,
): PublicEventDefinition<P>;
export function defineEvent<P = unknown>(
  event: EventDefinition<P>,
): EventDefinition<P> {
  return event;
}

// Re-export Context for convenience
export { Context } from "../moleculer";
