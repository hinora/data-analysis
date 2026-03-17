/**
 * Tests for tools/sortByField.action.ts
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

import sortByFieldAction from "../sortByField.action";

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

describe("tools.sortByField action", () => {
  defineTest({
    name: "should sort numeric field ascending",
    action: sortByFieldAction,
    params: { datasetId: DATASET_ID, field: "price", order: "ASC" },
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
            name: "Products",
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
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "C", price: "30" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "A", price: "10" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "B", price: "20" } },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.field).toBe("price");
      expect(result.order).toBe("ASC");
      expect(result.count).toBe(3);
      expect(result.results[0].price).toBe("10");
      expect(result.results[1].price).toBe("20");
      expect(result.results[2].price).toBe("30");
    },
  });

  defineTest({
    name: "should sort string field descending",
    action: sortByFieldAction,
    params: { datasetId: DATASET_ID, field: "name", order: "DESC", numeric: false },
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
            name: "Products",
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
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "Alice", price: "10" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "Charlie", price: "30" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "Bob", price: "20" } },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.field).toBe("name");
      expect(result.order).toBe("DESC");
      expect(result.count).toBe(3);
      expect(result.results[0].name).toBe("Charlie");
      expect(result.results[1].name).toBe("Bob");
      expect(result.results[2].name).toBe("Alice");
    },
  });

  defineTest({
    name: "should respect limit parameter",
    action: sortByFieldAction,
    params: { datasetId: DATASET_ID, field: "price", limit: 2 },
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
            name: "Products",
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
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "C", price: "30" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "A", price: "10" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "B", price: "20" } },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.count).toBe(2);
      expect(result.results).toHaveLength(2);
    },
  });
});
