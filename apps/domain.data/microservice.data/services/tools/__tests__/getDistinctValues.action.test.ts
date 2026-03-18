/**
 * Tests for tools/getDistinctValues.action.ts
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

import getDistinctValuesAction from "../getDistinctValues.action";

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

describe("tools.getDistinctValues action", () => {
  defineTest({
    name: "should return distinct values with counts sorted by frequency",
    action: getDistinctValuesAction,
    params: { datasetId: DATASET_ID, field: "category" },
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
            rowCount: 5,
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
            data: { category: "A" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { category: "B" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { category: "A" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { category: "A" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { category: "B" },
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.field).toBe("category");
      expect(result.distinctCount).toBe(2);
      expect(result.totalInDataset).toBe(2);
      expect(result.values).toHaveLength(2);
      // Sorted by count DESC: A (3) should come before B (2)
      expect(result.values[0].value).toBe("A");
      expect(Number(result.values[0].count)).toBe(3);
      expect(result.values[1].value).toBe("B");
      expect(Number(result.values[1].count)).toBe(2);
    },
  });

  defineTest({
    name: "should respect limit parameter",
    action: getDistinctValuesAction,
    params: { datasetId: DATASET_ID, field: "category", limit: 1 },
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
            columnCount: 1,
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
            data: { category: "A" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { category: "B" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { category: "C" },
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.values).toHaveLength(1);
      expect(result.totalInDataset).toBe(3);
    },
  });
});
