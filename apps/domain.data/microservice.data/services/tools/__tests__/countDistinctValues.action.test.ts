/**
 * Tests for tools/countDistinctValues.action.ts
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

import countDistinctValuesAction from "../countDistinctValues.action";

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

describe("tools.countDistinctValues action", () => {
  defineTest({
    name: "should count distinct values for a field",
    action: countDistinctValuesAction,
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
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { category: "A", value: "10" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { category: "B", value: "20" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { category: "A", value: "30" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { category: "C", value: "40" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { category: "B", value: "50" } },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.field).toBe("category");
      expect(result.distinctCount).toBe(3);
      expect(result.totalRecords).toBe(5);
    },
  });

  defineTest({
    name: "should return zero for non-existent field",
    action: countDistinctValuesAction,
    params: { datasetId: DATASET_ID, field: "nonExistent" },
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
            rowCount: 2,
            columnCount: 2,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
        ],
      },
      {
        entity: DataRecord,
        data: [
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { category: "A" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { category: "B" } },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.field).toBe("nonExistent");
      expect(result.distinctCount).toBe(0);
      expect(result.totalRecords).toBe(0);
    },
  });
});
