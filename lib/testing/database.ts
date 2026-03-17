/**
 * Test Database Utilities
 *
 * Creates an isolated TypeORM DataSource backed by a real PostgreSQL database
 * (a temporary test database) so that action tests can read/write actual rows.
 *
 * Usage:
 * 1. Call `createTestDataSource(entities)` in `beforeAll` – it creates a
 *    randomly-named database, connects to it and synchronises the schema.
 * 2. Use the returned DataSource in your tests (getRepository, etc.)
 * 3. Call `destroyTestDataSource(ds)` in `afterAll` to drop the database and
 *    close the connection.
 * 4. Optionally call `clearTestDatabase(ds, entities)` in `beforeEach` to
 *    truncate all tables between tests.
 */

import { DataSource, type EntitySchema } from "typeorm";

type EntityClass = EntitySchema | (new (...args: unknown[]) => unknown);

const DEFAULT_PG_URI = "postgresql://postgres:postgres@localhost:5433/postgres";

function getAdminUri(): string {
  return process.env.TEST_PG_URI || DEFAULT_PG_URI;
}

/**
 * Create a fresh test database and return an initialised DataSource.
 *
 * @param entities - TypeORM entity classes to register
 * @returns Connected DataSource pointing at the new test database
 *
 * @example
 * ```ts
 * let ds: DataSource;
 *
 * beforeAll(async () => {
 *   ds = await createTestDataSource([Session, Conversation]);
 * });
 *
 * afterAll(async () => {
 *   await destroyTestDataSource(ds);
 * });
 * ```
 */
export async function createTestDataSource(
  entities: EntityClass[],
): Promise<DataSource> {
  const dbName = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 1. Connect to the admin database to create the test database
  const adminDs = new DataSource({
    type: "postgres",
    url: getAdminUri(),
  });
  await adminDs.initialize();
  await adminDs.query(`CREATE DATABASE "${dbName}"`);
  await adminDs.destroy();

  // 2. Build connection URI for the new test database
  const parsed = new URL(getAdminUri());
  parsed.pathname = `/${dbName}`;
  const testUri = parsed.toString();

  // 3. Connect to the test database with schema sync
  const ds = new DataSource({
    type: "postgres",
    url: testUri,
    entities,
    synchronize: true,
    logging: false,
    extra: {
      options: "-c timezone=UTC",
    },
  });
  await ds.initialize();

  // Store the db name for cleanup
  (ds as DataSource & { __testDbName: string }).__testDbName = dbName;

  return ds;
}

/**
 * Drop the test database and close the DataSource.
 */
export async function destroyTestDataSource(ds: DataSource): Promise<void> {
  if (!ds) return;
  const dbName = (ds as DataSource & { __testDbName?: string }).__testDbName;
  await ds.destroy();

  if (dbName) {
    // Validate that the dbName matches expected pattern to prevent SQL injection
    if (!/^test_\d+_[a-z0-9]+$/.test(dbName)) {
      throw new Error(`Invalid test database name: ${dbName}`);
    }

    const adminDs = new DataSource({
      type: "postgres",
      url: getAdminUri(),
    });
    await adminDs.initialize();

    // Terminate existing connections before dropping
    await adminDs.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [dbName],
    );
    await adminDs.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await adminDs.destroy();
  }
}

/**
 * Truncate all entity tables in the test database.
 * Call this in `beforeEach` to ensure test isolation.
 */
export async function clearTestDatabase(
  ds: DataSource,
  entities: EntityClass[],
): Promise<void> {
  if (!ds?.isInitialized) return;

  // Use TRUNCATE ... CASCADE to handle foreign key constraints
  const tableNames = entities.map((entity) => {
    const metadata = ds.getMetadata(entity);
    return `"${metadata.tableName}"`;
  });

  if (tableNames.length > 0) {
    await ds.query(`TRUNCATE TABLE ${tableNames.join(", ")} CASCADE`);
  }
}
