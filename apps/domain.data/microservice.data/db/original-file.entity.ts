/**
 * OriginalFile TypeORM Entity
 *
 * Represents a raw uploaded file stored for provenance.
 * One OriginalFile may produce multiple Datasets (e.g., XLSM with multiple sheets/tables).
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { Dataset } from "./dataset.entity";

@Entity("originalFiles")
@Index("idx_originalFiles_sessionId", ["sessionId"])
@Index("idx_originalFiles_sessionId_fileHash", ["sessionId", "fileHash"], {
  unique: true,
})
export class OriginalFile {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  sessionId: string;

  @Column({ length: 500, type: "varchar" })
  filename: string;

  @Column({ length: 100, type: "varchar" })
  mimeType: string;

  @Column("bigint")
  fileSize: number;

  @Column({ length: 64, type: "varchar" })
  fileHash: string;

  @Column({ length: 1000, type: "varchar" })
  storagePath: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @OneToMany("Dataset", "originalFile")
  datasets: Dataset[];
}
