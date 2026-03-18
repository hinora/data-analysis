/**
 * Tests for tools/sampleData.action.ts
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
}));

import sampleDataAction from "../sampleData.action";

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

describe("tools.sampleData action", () => {
  defineTest({
    name: "should return sample rows from dataset",
    action: sampleDataAction,
    params: { datasetId: DATASET_ID },
    db: () => testDs,
    callStubs: {
      "dataset.getDataset": { id: DATASET_ID },
    },
    before: [
      {
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
      },
      {
        entity: Dataset,
        data: [
          {
            id: DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Sales Data",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 3,
            columnCount: 2,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
        ],
      },
      {
        entity: DataRecord,
        data: [
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { name: "Alice", age: "30" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { name: "Bob", age: "25" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { name: "Charlie", age: "35" },
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.count).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toHaveProperty("name");
      expect(result.results[0]).toHaveProperty("age");
    },
  });

  defineTest({
    name: "should respect the limit parameter",
    action: sampleDataAction,
    params: { datasetId: DATASET_ID, limit: 2 },
    db: () => testDs,
    callStubs: {
      "dataset.getDataset": { id: DATASET_ID },
    },
    before: [
      {
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
      },
      {
        entity: Dataset,
        data: [
          {
            id: DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Sales Data",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 3,
            columnCount: 2,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
        ],
      },
      {
        entity: DataRecord,
        data: [
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { name: "Alice", age: "30" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { name: "Bob", age: "25" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { name: "Charlie", age: "35" },
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.count).toBe(2);
      expect(result.results).toHaveLength(2);
    },
  });

  defineTest({
    name: "should return empty results for dataset with no records",
    action: sampleDataAction,
    params: { datasetId: DATASET_ID },
    db: () => testDs,
    callStubs: {
      "dataset.getDataset": { id: DATASET_ID },
    },
    before: [
      {
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
      },
      {
        entity: Dataset,
        data: [
          {
            id: DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Empty Data",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 0,
            columnCount: 2,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.count).toBe(0);
      expect(result.results).toHaveLength(0);
    },
  });
});
