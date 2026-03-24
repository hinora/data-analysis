/**
 * TextChunk TypeORM Entity
 *
 * A segment of unstructured text from a PDF or non-tabular content,
 * with vector embedding for semantic search via pgvector.
 *
 * Note: The embedding column uses pgvector's native vector type (dimensions defined by EMBEDDING_DIMENSIONS).
 * The HNSW index (idx_textChunks_embedding_hnsw) is created at startup
 * in app.ts via raw SQL since TypeORM doesn't natively support pgvector index syntax.
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
import { Dataset } from "./dataset.entity";

@Entity("textChunks")
@Index("idx_textChunks_datasetId_orderIndex", ["datasetId", "orderIndex"])
@Index("idx_textChunks_sessionId", ["sessionId"])
export class TextChunk {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  datasetId: string;

  @ManyToOne(
    () => Dataset,
    (dataset) => dataset.textChunks,
    {
      onDelete: "CASCADE",
    },
  )
  @JoinColumn({ name: "datasetId" })
  dataset: Dataset;

  @Column("uuid")
  sessionId: string;

  @Column("text")
  content: string;

  @Column({ nullable: true, type: "integer" })
  sourcePage: number | null;

  @Column({ length: 500, nullable: true, type: "varchar" })
  sourceSection: string | null;

  @Column("integer")
  orderIndex: number;

  /**
   * Vector embedding (nomic-embed-text) via pgvector.
   * Stored as pgvector's native vector type for efficient HNSW indexing.
   * Dimensions defined by EMBEDDING_DIMENSIONS constant in core.lib/adapters/ai.
   * Defined as `text` for TypeORM compatibility; app.ts alters to the correct vector type at startup.
   */
  @Column({ nullable: true, type: "text" })
  embedding: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
