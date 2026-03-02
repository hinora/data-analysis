/**
 * Conversation TypeORM Entity
 *
 * A single chat thread within a session. The system prompt is
 * constructed at creation time from session state and never updated.
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { ChatMessage } from "./chat-message.entity";
import { Session } from "./session.entity";

@Entity("conversations")
@Index("idx_conversations_sessionId_createdAt", ["sessionId", "createdAt"])
export class Conversation {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  sessionId: string;

  @ManyToOne(() => Session, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sessionId" })
  session: Session;

  @Column({ length: 500, type: "varchar" })
  name: string;

  @Column("text")
  systemPrompt: string;

  @Column({ default: 0, type: "integer" })
  messageCount: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;

  @OneToMany("ChatMessage", "conversation")
  messages: ChatMessage[];
}
