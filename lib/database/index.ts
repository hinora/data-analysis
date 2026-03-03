/**
 * Database module - TypeORM data source helpers for PostgreSQL
 *
 * Provides:
 * - createDataSource() utility for microservice data source configuration
 * - Shared entities (AILog) used across microservices
 */

import { DataSource, type DataSourceOptions, type EntitySchema } from "typeorm";

export type { ToolCallLog } from "./ai-log.entity";
export {
  AILog,
  AILogPurpose,
  AILogStatus,
  AILogType,
} from "./ai-log.entity";

/**
 * Options for creating a microservice data source
 */
export interface CreateDataSourceOptions {
  /** Database connection URI (e.g., postgres://user:pass@host:5432/dbname) */
  databaseUri: string;
  /** TypeORM entity classes to register */
  entities: (EntitySchema | (new (...args: unknown[]) => unknown))[];
  /** Enable pgvector extension (default: false) */
  enableVector?: boolean;
  /** Enable logging (default: false in production) */
  logging?: boolean;
  /** Migration paths */
  migrations?: string[];
  /** Enable synchronize for development (default: based on NODE_ENV) */
  synchronize?: boolean;
}

/**
 * Create a TypeORM DataSource for a microservice
 *
 * @param options - Data source configuration
 * @returns Initialized DataSource (not yet connected)
 */
export function createDataSource(options: CreateDataSourceOptions): DataSource {
  const {
    databaseUri,
    entities,
    enableVector: _enableVector = false,
    logging = false,
    migrations = [],
    synchronize = process.env.NODE_ENV === "development",
  } = options;

  const dsOptions: DataSourceOptions = {
    entities,
    extra: {
      // Force all PostgreSQL sessions to use UTC to prevent timezone
      // double-offset when the Node.js process runs in a non-UTC timezone.
      options: "-c timezone=UTC",
    },
    logging,
    migrations,
    synchronize,
    type: "postgres",
    url: databaseUri,
  };

  return new DataSource(dsOptions);
}
