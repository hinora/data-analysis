/**
 * TextChunk TypeORM Entity
 *
 * A segment of unstructured text from a PDF or non-tabular content,
 * with vector embedding for semantic search via pgvector.
 *
 * Note: The embedding column uses pgvector's vector(768) type.
 * The HNSW index for vector search is created manually via migration
 * or raw SQL since TypeORM doesn't natively support pgvector index syntax.
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
   * 768-dimensional vector embedding (nomic-embed-text) via pgvector.
   * Stored as a string representation for TypeORM compatibility;
   * pgvector handles the actual vector type in PostgreSQL.
   */
  @Column({ nullable: true, type: "text" })
  embedding: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
