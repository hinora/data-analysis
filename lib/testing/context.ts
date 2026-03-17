/**
 * Test Context Factory
 *
 * Creates a lightweight mock of the Moleculer Context used by action handlers.
 * Supports:
 *  - Typed params
 *  - Mocked `ctx.call()` – stub inter-service calls
 *  - Mocked `ctx.emit()` / `ctx.broadcast()`
 *  - A silent broker logger
 */

import type { Context } from "../moleculer";

/**
 * Stubs map: action name → return value (or async function).
 *
 * @example
 * ```ts
 * const stubs: CallStubs = {
 *   "session.updateSessionStatus": { success: true },
 *   "dataset.listDatasets": async () => [{ id: "1", name: "Test" }],
 * };
 * ```
 */
export type CallStubs = Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: allow any for test stubs
  | ((...args: any[]) => any | Promise<any>)
  // biome-ignore lint/suspicious/noExplicitAny: allow any for test stubs
  | any
>;

export interface CreateTestContextOptions<P = unknown> {
  /** Action parameters */
  params: P;
  /** Optional meta (e.g. for authenticated contexts) */
  meta?: Record<string, unknown>;
  /** Stubs for `ctx.call()` – keyed by action name */
  callStubs?: CallStubs;
  /** Optional caller service name */
  caller?: string;
}

/**
 * A no-op logger that satisfies the broker.logger interface.
 */
const silentLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  info: jest.fn(),
  trace: jest.fn(),
  warn: jest.fn(),
};

/**
 * Create a mock Moleculer Context for testing action handlers.
 *
 * @example
 * ```ts
 * const ctx = createTestContext({
 *   params: { name: "My Session" },
 *   callStubs: {
 *     "session.updateSessionStatus": { success: true },
 *   },
 * });
 *
 * const result = await myAction.handler(ctx);
 * expect(result.name).toBe("My Session");
 * expect(ctx.call).toHaveBeenCalledWith(
 *   "session.updateSessionStatus",
 *   expect.anything(),
 * );
 * ```
 */
export function createTestContext<P = unknown>(
  options: CreateTestContextOptions<P>,
): Context<P> {
  const { params, meta = {}, callStubs = {}, caller } = options;

  const callMock = jest.fn(async (actionName: string, ...args: unknown[]) => {
    const stub = callStubs[actionName];
    if (stub === undefined) {
      throw new Error(
        `Unmocked ctx.call("${actionName}"). ` +
          "Add it to callStubs when creating the test context.",
      );
    }
    return typeof stub === "function" ? stub(...args) : stub;
  });

  const emitMock = jest.fn(async () => {});
  const broadcastMock = jest.fn(async () => {});

  const ctx = {
    params,
    meta,
    caller,

    // Inter-service communication
    call: callMock,
    emit: emitMock,
    broadcast: broadcastMock,

    // Broker with a silent logger
    broker: {
      logger: silentLogger,
    },

    // Tracing / span stubs
    span: { log: jest.fn() },
    startSpan: jest.fn(),
    finishSpan: jest.fn(),
  } as unknown as Context<P>;

  return ctx;
}
