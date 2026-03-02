/**
 * ChatMessage TypeORM Entity
 *
 * A single message in a conversation thread.
 * Assistant messages include confidence scores, cited sources,
 * tools used, and reasoning steps.
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Conversation } from "./conversation.entity";

export enum MessageRole {
  ASSISTANT = "assistant",
  SYSTEM = "system",
  USER = "user",
}

export interface CitedSource {
  columnName?: string;
  datasetId: string;
  datasetName: string;
}

export interface ToolUsage {
  parameters: Record<string, unknown>;
  resultSummary: string;
  toolName: string;
}

@Entity("chatMessages")
@Index("idx_chatMessages_conversationId_createdAt", [
  "conversationId",
  "createdAt",
])
@Index("idx_chatMessages_sessionId", ["sessionId"])
export class ChatMessage {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  conversationId: string;

  @ManyToOne(
    () => Conversation,
    (conv) => conv.messages,
    {
      onDelete: "CASCADE",
    },
  )
  @JoinColumn({ name: "conversationId" })
  conversation: Conversation;

  @Column("uuid")
  sessionId: string;

  @Column({ enum: MessageRole, type: "enum" })
  role: MessageRole;

  @Column("text")
  content: string;

  @Column({ nullable: true, type: "real" })
  confidenceScore: number | null;

  @Column({ nullable: true, type: "jsonb" })
  citedSources: CitedSource[] | null;

  @Column({ nullable: true, type: "jsonb" })
  toolsUsed: ToolUsage[] | null;

  @Column({ nullable: true, type: "jsonb" })
  reasoningSteps: string[] | null;

  @CreateDateColumn()
  createdAt: Date;
}
