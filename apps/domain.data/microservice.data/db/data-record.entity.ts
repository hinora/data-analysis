/**
 * DataRecord TypeORM Entity
 *
 * Individual rows parsed from a structured table dataset.
 * Data is stored as schemaless JSONB — each record contains row data
 * as key-value pairs using camelCase column keys.
 */

import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Dataset } from "./dataset.entity";

@Entity("dataRecords")
@Index("idx_dataRecords_datasetId", ["datasetId"])
@Index("idx_dataRecords_sessionId_datasetId", ["sessionId", "datasetId"])
export class DataRecord {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  datasetId: string;

  @ManyToOne(
    () => Dataset,
    (dataset) => dataset.dataRecords,
    {
      onDelete: "CASCADE",
    },
  )
  @JoinColumn({ name: "datasetId" })
  dataset: Dataset;

  @Column("uuid")
  sessionId: string;

  @Column("jsonb")
  data: Record<string, unknown>;
}
