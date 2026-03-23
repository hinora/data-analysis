/**
 * Analysis Database Configuration
 *
 * TypeORM DataSource for the analysis_db (Session, Conversation, ChatMessage, AILog).
 * Initialised on microservice startup; entities are registered here.
 */

import { AILog, createDataSource } from "core.lib/database";
import { ChatMessage } from "./chat-message.entity";
import { Conversation } from "./conversation.entity";
import { Session } from "./session.entity";

export type {
  ChartSpec,
  CitedSource,
  MessageMetadata,
  PromptStats,
  ToolUsage,
} from "./chat-message.entity";
export { ChatMessage, MessageRole } from "./chat-message.entity";
export { Conversation } from "./conversation.entity";
export { Session, SessionStatus } from "./session.entity";

const ANALYSIS_DB_URI =
  process.env.ANALYSIS_DB_URI ||
  "postgresql://postgres:postgres@localhost:5432/analysis_db";

export const dataSource = createDataSource({
  databaseUri: ANALYSIS_DB_URI,
  entities: [Session, Conversation, ChatMessage, AILog],
  synchronize: process.env.NODE_ENV !== "production",
});
