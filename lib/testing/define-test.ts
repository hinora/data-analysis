/**
 * Define Test Helper
 *
 * Provides a declarative way to test action handlers with:
 * - Database seeding (before state)
 * - Automatic context creation
 * - Result assertions
 * - Database state assertions (after state)
 * - Hooks for mocking setup/teardown
 */

import type { DataSource } from "typeorm";
import { type CallStubs, createTestContext } from "./context";

// biome-ignore lint/suspicious/noExplicitAny: flexible entity type for testing
type EntityClass = new (...args: any[]) => any;

/**
 * Seed specification: entity class + records to insert before the action runs.
 * Records are inserted in array order using repo.save(repo.create(record)).
 */
export interface EntitySeed {
  entity: EntityClass;
  data: Record<string, unknown>[];
}

/**
 * Assertion specification: entity class + assertion function for post-action DB state.
 */
export interface EntityAssertion {
  entity: EntityClass;
  // biome-ignore lint/suspicious/noExplicitAny: flexible record type
  assert: (records: any[]) => void | Promise<void>;
  order?: Record<string, "ASC" | "DESC">;
}

export interface DefineTestOptions<P = unknown, R = unknown> {
  /** Test case name */
  name: string;

  /** The action to test (must have a handler function) */
  // biome-ignore lint/suspicious/noExplicitAny: handler context type varies
  action: { handler: (ctx: any) => Promise<R> | R };

  /** Action parameters */
  params: P;

  /** Stubs for ctx.call() — keyed by action name */
  callStubs?: CallStubs;

  /** Context metadata (e.g. for authenticated contexts) */
  meta?: Record<string, unknown>;

  /** DataSource getter for database operations (required when using before/after) */
  db?: () => DataSource;

  /**
   * Seed the database before running the action.
   * - Array form: declarative list of entities + records to insert
   * - Function form: imperative seeding with full DataSource access
   */
  before?: EntitySeed[] | ((ds: DataSource) => Promise<void> | void);

  /**
   * Assert database state after the action runs.
   * - Array form: declarative list of entities + assertion functions
   * - Function form: imperative assertions with full DataSource access + result
   */
  after?:
    | EntityAssertion[]
    | ((ds: DataSource, result?: R) => Promise<void> | void);

  /** Assert the action result */
  assertResult?: (result: R) => void | Promise<void>;

  /** Expect the action to throw an error matching this string or pattern */
  expectError?: string | RegExp;

  /** Custom setup before the test runs (e.g. configure mocks) */
  beforeTest?: () => void | Promise<void>;

  /** Custom teardown after the test runs (e.g. reset mocks) */
  afterTest?: () => void | Promise<void>;
}

/**
 * Define a single test case for an action handler.
 *
 * Generates an `it(...)` block that:
 * 1. Runs the `beforeTest` hook
 * 2. Seeds the database with `before` data
 * 3. Creates a test context with params/callStubs/meta
 * 4. Executes the action handler (or asserts it throws)
 * 5. Runs `assertResult` on the return value
 * 6. Runs `after` assertions on the database state
 * 7. Runs the `afterTest` hook
 *
 * @example
 * ```ts
 * defineTest({
 *   name: "should create a session with custom name",
 *   action: createAction,
 *   params: { name: "My Session" },
 *   db: () => testDs,
 *   assertResult: (result) => {
 *     expect(result.name).toBe("My Session");
 *   },
 *   after: [{
 *     entity: Session,
 *     assert: (sessions) => expect(sessions).toHaveLength(1),
 *   }],
 * });
 * ```
 */
export function defineTest<P = unknown, R = unknown>(
  options: DefineTestOptions<P, R>,
): void {
  it(options.name, async () => {
    // 1. Run beforeTest hook
    if (options.beforeTest) {
      await options.beforeTest();
    }

    try {
      // 2. Seed database with "before" data
      if (options.before) {
        if (!options.db) {
          throw new Error(
            "defineTest: 'db' option is required when using 'before'",
          );
        }
        const ds = options.db();

        if (typeof options.before === "function") {
          await options.before(ds);
        } else {
          for (const seed of options.before) {
            const repo = ds.getRepository(seed.entity);
            for (const record of seed.data) {
              // biome-ignore lint/suspicious/noExplicitAny: flexible record type
              await repo.save(repo.create(record as any));
            }
          }
        }
      }

      // 3. Create test context
      const ctx = createTestContext({
        params: options.params,
        callStubs: options.callStubs,
        meta: options.meta,
      });

      // 4. Run action — handle expected errors
      if (options.expectError) {
        await expect(options.action.handler(ctx)).rejects.toThrow(
          options.expectError,
        );
        return;
      }

      const result = await options.action.handler(ctx);

      // 5. Assert result
      if (options.assertResult) {
        await options.assertResult(result);
      }

      // 6. Assert database state
      if (options.after) {
        if (!options.db) {
          throw new Error(
            "defineTest: 'db' option is required when using 'after'",
          );
        }
        const ds = options.db();

        if (typeof options.after === "function") {
          await options.after(ds, result);
        } else {
          for (const assertion of options.after) {
            const repo = ds.getRepository(assertion.entity);
            // biome-ignore lint/suspicious/noExplicitAny: flexible find options
            const findOptions: any = {};
            if (assertion.order) {
              findOptions.order = assertion.order;
            }
            const records = await repo.find(findOptions);
            await assertion.assert(records);
          }
        }
      }
    } finally {
      // 7. Run afterTest hook (always runs, even on failure)
      if (options.afterTest) {
        await options.afterTest();
      }
    }
  });
}
