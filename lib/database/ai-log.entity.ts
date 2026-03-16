/**
 * AILog TypeORM Entity
 *
 * Shared audit record for every AI interaction (Constitution Principle III & VI).
 * Both microservice.analysis and microservice.data use this entity in their own databases.
 * The `type` column distinguishes chat interactions from metadata-generation interactions.
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum AILogType {
  CHAT = "chat",
  METADATA = "metadata",
}

export enum AILogPurpose {
  EMBEDDING_GENERATION = "embedding-generation",
  NAME_GENERATION = "name-generation",
  RELATIONSHIP_DETECTION = "relationship-detection",
  STRUCTURED_METADATA = "structured-metadata",
  UNSTRUCTURED_METADATA = "unstructured-metadata",
}

export enum AILogStatus {
  FAILED = "failed",
  SUCCESS = "success",
}

/**
 * Tool call log entry stored in toolCalls JSONB
 */
export interface ToolCallLog {
  durationMs: number;
  iterationIndex: number;
  parameters: Record<string, unknown>;
  resultSummary: string;
  toolName: string;
}

@Entity("aiLogs")
@Index("idx_aiLogs_type_sessionId_createdAt", [
  "type",
  "sessionId",
  "createdAt",
])
@Index("idx_aiLogs_conversationId_createdAt", ["conversationId", "createdAt"])
@Index("idx_aiLogs_datasetId_createdAt", ["datasetId", "createdAt"])
export class AILog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ enum: AILogType, type: "enum" })
  type: AILogType;

  @Column("uuid")
  sessionId: string;

  @Column({ nullable: true, type: "uuid" })
  conversationId: string | null;

  @Column({ nullable: true, type: "uuid" })
  messageId: string | null;

  @Column({ nullable: true, type: "uuid" })
  datasetId: string | null;

  @Column({
    enum: AILogPurpose,
    nullable: true,
    type: "enum",
  })
  purpose: AILogPurpose | null;

  @Column("text")
  promptSent: string;

  @Column("text")
  responseReceived: string;

  @Column({ length: 100, type: "varchar" })
  model: string;

  @Column({ length: 50, type: "varchar" })
  provider: string;

  @Column("integer")
  promptTokens: number;

  @Column("integer")
  completionTokens: number;

  @Column("integer")
  totalTokens: number;

  @Column("integer")
  latencyMs: number;

  @Column({ nullable: true, type: "jsonb" })
  toolCalls: ToolCallLog[] | null;

  @Column({ nullable: true, type: "integer" })
  iterationCount: number | null;

  @Column({ nullable: true, type: "real" })
  confidenceScore: number | null;

  @Column({
    enum: AILogStatus,
    nullable: true,
    type: "enum",
  })
  status: AILogStatus | null;

  @Column({ nullable: true, type: "text" })
  errorMessage: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
