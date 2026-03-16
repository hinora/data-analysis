/**
 * Data Database Configuration
 *
 * TypeORM DataSource for the data_db (Dataset, DataRecord, TextChunk, OriginalFile, AILog).
 * Initialises pgvector extension on connection. Entities are registered here.
 */

import { AILog, createDataSource } from "core.lib/database";
import { DataRecord } from "./data-record.entity";
import { Dataset } from "./dataset.entity";
import { OriginalFile } from "./original-file.entity";
import { TextChunk } from "./text-chunk.entity";

export { AILog, AILogPurpose, AILogStatus, AILogType } from "./ai-log.entity";
export { DataRecord } from "./data-record.entity";
export type {
  ColumnMapping,
  RelationshipSuggestion,
  StructuredMetadata,
  UnstructuredMetadata,
} from "./dataset.entity";
export {
  Dataset,
  DatasetType,
  FileType,
  MetadataStatus,
} from "./dataset.entity";
export { OriginalFile } from "./original-file.entity";
export { TextChunk } from "./text-chunk.entity";

const DATA_DB_URI =
  process.env.DATA_DB_URI ||
  "postgresql://postgres:postgres@localhost:5432/data_db";

export const dataSource = createDataSource({
  databaseUri: DATA_DB_URI,
  entities: [Dataset, DataRecord, TextChunk, OriginalFile, AILog],
  enableVector: true,
  synchronize: process.env.NODE_ENV !== "production",
});

/**
 * Returns the quoted table name for an entity from TypeORM metadata.
 * Use this in raw SQL queries instead of hardcoding table names.
 */
export function getTableName(
  entity: Parameters<typeof dataSource.getMetadata>[0],
): string {
  const { tableName } = dataSource.getMetadata(entity);
  return `"${tableName}"`;
}
