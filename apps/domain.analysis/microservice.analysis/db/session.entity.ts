/**
 * Session TypeORM Entity
 *
 * Represents an isolated analysis workspace containing datasets and conversations.
 * Sessions track lifecycle status and denormalized counts for efficient listing.
 * Each session belongs to a user (userId).
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum SessionStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
  EMPTY = "empty",
  HAS_DATA = "has-data",
}

@Entity("sessions")
@Index("idx_sessions_createdAt", ["createdAt"])
@Index("idx_sessions_userId", ["userId"])
export class Session {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @Column({ length: 200, type: "varchar" })
  name: string;

  @Column({
    default: SessionStatus.EMPTY,
    enum: SessionStatus,
    type: "enum",
  })
  status: SessionStatus;

  @Column({ default: 0, type: "integer" })
  datasetCount: number;

  @Column({ default: 0, type: "integer" })
  conversationCount: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
