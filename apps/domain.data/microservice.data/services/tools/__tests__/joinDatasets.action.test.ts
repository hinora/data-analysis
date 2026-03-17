/**
 * Tests for tools/joinDatasets.action.ts
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

import joinDatasetsAction from "../joinDatasets.action";

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
const LEFT_DATASET_ID = "44444444-4444-4444-8444-444444444444";
const RIGHT_DATASET_ID = "55555555-5555-4555-8555-555555555555";

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

describe("tools.joinDatasets action", () => {
  defineTest({
    name: "should perform inner join on matching fields",
    action: joinDatasetsAction,
    params: {
      leftDatasetId: LEFT_DATASET_ID,
      rightDatasetId: RIGHT_DATASET_ID,
      leftField: "userId",
      rightField: "id",
      joinType: "inner",
    },
    db: () => testDs,
    callStubs: {
      "dataset.getDataset": (params: { id: string }) => ({ id: params.id }),
    },
    before: [
      SEED_FILE,
      {
        entity: Dataset,
        data: [
          {
            id: LEFT_DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Orders",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 3,
            columnCount: 2,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
          {
            id: RIGHT_DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Users",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 2,
            columnCount: 2,
            sourceFileHash: "def456",
            importedAt: new Date(),
          },
        ],
      },
      {
        entity: DataRecord,
        data: [
          // Left dataset: Orders
          { datasetId: LEFT_DATASET_ID, sessionId: SESSION_ID, data: { userId: "1", product: "Laptop" } },
          { datasetId: LEFT_DATASET_ID, sessionId: SESSION_ID, data: { userId: "2", product: "Phone" } },
          { datasetId: LEFT_DATASET_ID, sessionId: SESSION_ID, data: { userId: "3", product: "Tablet" } },
          // Right dataset: Users
          { datasetId: RIGHT_DATASET_ID, sessionId: SESSION_ID, data: { id: "1", name: "Alice" } },
          { datasetId: RIGHT_DATASET_ID, sessionId: SESSION_ID, data: { id: "2", name: "Bob" } },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.joinType).toBe("inner");
      expect(result.leftField).toBe("userId");
      expect(result.rightField).toBe("id");
      // Only users 1 and 2 match (inner join)
      expect(result.count).toBe(2);
      expect(result.results[0]).toHaveProperty("product");
      expect(result.results[0]).toHaveProperty("name");
    },
  });

  defineTest({
    name: "should perform left join preserving all left records",
    action: joinDatasetsAction,
    params: {
      leftDatasetId: LEFT_DATASET_ID,
      rightDatasetId: RIGHT_DATASET_ID,
      leftField: "userId",
      rightField: "id",
      joinType: "left",
    },
    db: () => testDs,
    callStubs: {
      "dataset.getDataset": (params: { id: string }) => ({ id: params.id }),
    },
    before: [
      SEED_FILE,
      {
        entity: Dataset,
        data: [
          {
            id: LEFT_DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Orders",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 3,
            columnCount: 2,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
          {
            id: RIGHT_DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Users",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 2,
            columnCount: 2,
            sourceFileHash: "def456",
            importedAt: new Date(),
          },
        ],
      },
      {
        entity: DataRecord,
        data: [
          { datasetId: LEFT_DATASET_ID, sessionId: SESSION_ID, data: { userId: "1", product: "Laptop" } },
          { datasetId: LEFT_DATASET_ID, sessionId: SESSION_ID, data: { userId: "2", product: "Phone" } },
          { datasetId: LEFT_DATASET_ID, sessionId: SESSION_ID, data: { userId: "3", product: "Tablet" } },
          { datasetId: RIGHT_DATASET_ID, sessionId: SESSION_ID, data: { id: "1", name: "Alice" } },
          { datasetId: RIGHT_DATASET_ID, sessionId: SESSION_ID, data: { id: "2", name: "Bob" } },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.joinType).toBe("left");
      // Left join preserves all 3 left rows
      expect(result.count).toBe(3);
    },
  });

  defineTest({
    name: "should return empty results when no fields match",
    action: joinDatasetsAction,
    params: {
      leftDatasetId: LEFT_DATASET_ID,
      rightDatasetId: RIGHT_DATASET_ID,
      leftField: "userId",
      rightField: "id",
      joinType: "inner",
    },
    db: () => testDs,
    callStubs: {
      "dataset.getDataset": (params: { id: string }) => ({ id: params.id }),
    },
    before: [
      SEED_FILE,
      {
        entity: Dataset,
        data: [
          {
            id: LEFT_DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Orders",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 1,
            columnCount: 2,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
          {
            id: RIGHT_DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Users",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 1,
            columnCount: 2,
            sourceFileHash: "def456",
            importedAt: new Date(),
          },
        ],
      },
      {
        entity: DataRecord,
        data: [
          { datasetId: LEFT_DATASET_ID, sessionId: SESSION_ID, data: { userId: "999", product: "Laptop" } },
          { datasetId: RIGHT_DATASET_ID, sessionId: SESSION_ID, data: { id: "1", name: "Alice" } },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.count).toBe(0);
      expect(result.results).toHaveLength(0);
    },
  });
});
