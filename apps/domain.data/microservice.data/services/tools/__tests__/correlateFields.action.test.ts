/**
 * Tests for tools/correlateFields.action.ts
 */

import { AILog } from "core.lib/database";
import {
  clearTestDatabase,
  createTestDataSource,
  defineTest,
  destroyTestDataSource,
} from "core.lib/testing";
import type { DataSource } from "typeorm";
import { DataRecord } from "../../../db/data-record.entity";
import {
  Dataset,
  DatasetType,
  FileType,
  MetadataStatus,
} from "../../../db/dataset.entity";
import { OriginalFile } from "../../../db/original-file.entity";
import { TextChunk } from "../../../db/text-chunk.entity";

let testDs: DataSource;

jest.mock("../../../db", () => ({
  get dataSource() {
    return testDs;
  },
  getTableName: (entity: any) => {
    const meta = testDs.getMetadata(entity);
    return `"${meta.tableName}"`;
  },
}));

import correlateFieldsAction from "../correlateFields.action";

beforeAll(async () => {
  testDs = await createTestDataSource([
    OriginalFile,
    Dataset,
    DataRecord,
    TextChunk,
    AILog,
  ]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [
    AILog,
    DataRecord,
    TextChunk,
    Dataset,
    OriginalFile,
  ]);
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const FILE_ID = "33333333-3333-4333-8333-333333333333";
const DATASET_ID = "44444444-4444-4444-8444-444444444444";

const SEED_FILE = {
  entity: OriginalFile,
  data: [
    {
      id: FILE_ID,
      sessionId: SESSION_ID,
      filename: "test.csv",
      mimeType: "text/csv",
      fileSize: 1024,
      fileHash: "abc123",
      storagePath: "/tmp/test.csv",
    },
  ],
};

const SEED_DATASET = {
  entity: Dataset,
  data: [
    {
      id: DATASET_ID,
      sessionId: SESSION_ID,
      originalFileId: FILE_ID,
      name: "Data",
      fileType: FileType.CSV,
      datasetType: DatasetType.STRUCTURED_TABLE,
      metadataStatus: MetadataStatus.READY,
      rowCount: 5,
      columnCount: 3,
      sourceFileHash: "abc123",
      importedAt: new Date(),
    },
  ],
};

describe("tools.correlateFields action", () => {
  defineTest({
    name: "should calculate positive correlation between two numeric fields",
    action: correlateFieldsAction,
    params: { datasetId: DATASET_ID, field1: "x", field2: "y" },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [
      SEED_FILE,
      SEED_DATASET,
      {
        entity: DataRecord,
        data: [
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { x: "1", y: "2" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { x: "2", y: "4" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { x: "3", y: "6" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { x: "4", y: "8" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { x: "5", y: "10" },
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.field1).toBe("x");
      expect(result.field2).toBe("y");
      expect(result.correlation).toBeCloseTo(1, 5);
      expect(result.strength).toBe("very strong");
      expect(result.direction).toBe("positive");
      expect(result.sampleSize).toBeDefined();
      expect(result.stats.mean1).toBeDefined();
      expect(result.stats.mean2).toBeDefined();
    },
  });

  defineTest({
    name: "should detect negative correlation",
    action: correlateFieldsAction,
    params: { datasetId: DATASET_ID, field1: "x", field2: "y" },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [
      SEED_FILE,
      SEED_DATASET,
      {
        entity: DataRecord,
        data: [
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { x: "1", y: "10" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { x: "2", y: "8" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { x: "3", y: "6" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { x: "4", y: "4" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { x: "5", y: "2" },
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.correlation).toBeCloseTo(-1, 5);
      expect(result.strength).toBe("very strong");
      expect(result.direction).toBe("negative");
    },
  });

  defineTest({
    name: "should throw error for non-numeric fields",
    action: correlateFieldsAction,
    params: { datasetId: DATASET_ID, field1: "name", field2: "y" },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [
      SEED_FILE,
      SEED_DATASET,
      {
        entity: DataRecord,
        data: [
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { name: "Alice", y: "10" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { name: "Bob", y: "20" },
          },
        ],
      },
    ],
    expectError: "non-numeric",
  });
});
