/**
 * AILog Entity re-export for analysis microservice
 *
 * The shared AILog entity from core.lib is used in analysis_db with type: "chat"
 * for logging AI interactions during chat conversations.
 */

export type { ToolCallLog } from "core.lib/database";
export { AILog, AILogPurpose, AILogStatus, AILogType } from "core.lib/database";
