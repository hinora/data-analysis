/**
 * AILog Entity re-export for data microservice
 *
 * The shared AILog entity from core.lib is used in data_db with type: "metadata"
 * for logging AI interactions during metadata generation and embedding computation.
 */

export type { ToolCallLog } from "core.lib/database";
export { AILog, AILogPurpose, AILogStatus, AILogType } from "core.lib/database";
