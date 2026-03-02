/**
 * Dataset TypeORM Entity
 *
 * A single detected table or text block from an imported file.
 * Column mappings and metadata are stored as JSONB for flexibility.
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
import type { DataRecord } from "./data-record.entity";
import { OriginalFile } from "./original-file.entity";
import type { TextChunk } from "./text-chunk.entity";

export enum FileType {
  CSV = "csv",
  PDF = "pdf",
  XLSM = "xlsm",
}

export enum DatasetType {
  STRUCTURED_TABLE = "structured-table",
  UNSTRUCTURED_TEXT = "unstructured-text",
}

export enum MetadataStatus {
  FAILED = "failed",
  IN_PROGRESS = "in-progress",
  PENDING = "pending",
  READY = "ready",
}

export interface ColumnMapping {
  camelCase: string;
  detectedType: "boolean" | "date" | "number" | "string";
  order: number;
  original: string;
}

export interface StructuredMetadata {
  columnDescriptions: Array<{
    columnKey: string;
    columnOriginal: string;
    description: string;
    exampleValues: string[];
  }>;
  datasetDescription: string;
  statistics: Array<{
    columnKey: string;
    average?: number;
    max?: number;
    min?: number;
    nullCount: number;
    topFrequentValues?: Array<{ count: number; value: string }>;
    uniqueCount?: number;
  }>;
}

export interface UnstructuredMetadata {
  chunkCount: number;
  contentDomain: string;
  documentSummary: string;
  entities: Array<{
    count: number;
    name: string;
    type: "date" | "location" | "monetary" | "organisation" | "person";
  }>;
  keyTopics: string[];
  wordCount: number;
}

export interface RelationshipSuggestion {
  description: string;
  relatedDatasetId: string;
  relatedDatasetName: string;
  relationshipType: "shared-column" | "shared-entity" | "shared-topic";
  sharedFields?: string[];
}

@Entity("datasets")
@Index("idx_datasets_sessionId_createdAt", ["sessionId", "createdAt"])
@Index(
  "idx_datasets_sessionId_sourceFileHash",
  ["sessionId", "sourceFileHash"],
  {
    unique: true,
  },
)
export class Dataset {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  sessionId: string;

  @Column("uuid")
  originalFileId: string;

  @ManyToOne(
    () => OriginalFile,
    (file) => file.datasets,
    {
      onDelete: "CASCADE",
    },
  )
  @JoinColumn({ name: "originalFileId" })
  originalFile: OriginalFile;

  @Column({ length: 500, type: "varchar" })
  name: string;

  @Column({ enum: FileType, type: "enum" })
  fileType: FileType;

  @Column({ enum: DatasetType, type: "enum" })
  datasetType: DatasetType;

  @Column({
    default: MetadataStatus.PENDING,
    enum: MetadataStatus,
    type: "enum",
  })
  metadataStatus: MetadataStatus;

  @Column("integer")
  rowCount: number;

  @Column({ nullable: true, type: "integer" })
  columnCount: number | null;

  @Column({ nullable: true, type: "jsonb" })
  columnMappings: ColumnMapping[] | null;

  @Column({ length: 200, nullable: true, type: "varchar" })
  sheetName: string | null;

  @Column({ nullable: true, type: "integer" })
  tablePosition: number | null;

  @Column({ length: 64, type: "varchar" })
  sourceFileHash: string;

  @Column("timestamptz")
  importedAt: Date;

  @Column({ nullable: true, type: "jsonb" })
  structuredMetadata: StructuredMetadata | null;

  @Column({ nullable: true, type: "jsonb" })
  unstructuredMetadata: UnstructuredMetadata | null;

  @Column({ nullable: true, type: "jsonb" })
  relationships: RelationshipSuggestion[] | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;

  @OneToMany("DataRecord", "dataset")
  dataRecords: DataRecord[];

  @OneToMany("TextChunk", "dataset")
  textChunks: TextChunk[];
}
