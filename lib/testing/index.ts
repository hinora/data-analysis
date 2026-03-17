/**
 * Testing Utilities
 *
 * Shared test helpers for the moleculer-ts monorepo.
 *
 * Provides:
 * - `createTestContext()` – mock Moleculer context with stubbed ctx.call / ctx.emit
 * - `createTestDataSource()` / `destroyTestDataSource()` / `clearTestDatabase()`
 *     – isolated test database lifecycle
 * - `createMockAIAdapter()` – fully mocked AI adapter
 * - `defineTest()` – declarative action test helper
 */

export { aiDefaults, createMockAIAdapter } from "./ai";
export type { CallStubs, CreateTestContextOptions } from "./context";
export { createTestContext } from "./context";
export {
  clearTestDatabase,
  createTestDataSource,
  destroyTestDataSource,
} from "./database";
export type {
  DefineTestOptions,
  EntityAssertion,
  EntitySeed,
} from "./define-test";
export { defineTest } from "./define-test";
