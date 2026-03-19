/**
 * Tests for dataset/previewDataset.action.ts
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

import previewDatasetAction from "../previewDataset.action";

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
const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const TEST_META = {
  user: {
    id: TEST_USER_ID,
    email: "test@example.com",
    nickName: "Test User",
    isActive: true,
    isVerified: false,
  },
};

describe("dataset.previewDataset action", () => {
  defineTest({
    name: "should return preview data with column info",
    action: previewDatasetAction,
    params: { id: DATASET_ID },
    meta: TEST_META,
    callStubs: {
      "session.verifySessionOwnership": {
        sessionId: SESSION_ID,
        userId: TEST_USER_ID,
      },
    },
    db: () => testDs,
    before: [
      {
        entity: OriginalFile,
        data: [
          {
            id: FILE_ID,
            sessionId: SESSION_ID,
            filename: "sales.csv",
            mimeType: "text/csv",
            fileSize: 1024,
            fileHash: "preview123",
            storagePath: "/tmp/sales.csv",
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
            columnMappings: [
              {
                original: "Product Name",
                camelCase: "productName",
                detectedType: "string",
                order: 0,
              },
              {
                original: "Revenue",
                camelCase: "revenue",
                detectedType: "number",
                order: 1,
              },
            ],
            sourceFileHash: "preview123",
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
            data: { productName: "Widget A", revenue: 1000 },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { productName: "Widget B", revenue: 2000 },
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.dataset.id).toBe(DATASET_ID);
      expect(result.dataset.name).toBe("Sales Data");
      expect(result.columns).toHaveLength(2);
      expect(result.columns[0].original).toBe("Product Name");
      expect(result.columns[0].camelCase).toBe("productName");
      expect(result.rows).toHaveLength(2);
      expect(result.previewCount).toBe(2);
    },
  });

  defineTest({
    name: "should respect limit parameter",
    action: previewDatasetAction,
    params: { id: DATASET_ID, limit: 1 },
    meta: TEST_META,
    callStubs: {
      "session.verifySessionOwnership": {
        sessionId: SESSION_ID,
        userId: TEST_USER_ID,
      },
    },
    db: () => testDs,
    before: [
      {
        entity: OriginalFile,
        data: [
          {
            id: FILE_ID,
            sessionId: SESSION_ID,
            filename: "data.csv",
            mimeType: "text/csv",
            fileSize: 512,
            fileHash: "limit123",
            storagePath: "/tmp/data.csv",
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
            name: "Limited",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 2,
            columnCount: 1,
            sourceFileHash: "limit123",
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
            data: { value: 1 },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { value: 2 },
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.rows).toHaveLength(1);
      expect(result.previewCount).toBe(1);
    },
  });

  defineTest({
    name: "should throw 404 when dataset not found",
    action: previewDatasetAction,
    params: { id: "00000000-0000-4000-8000-000000000000" },
    meta: TEST_META,
    callStubs: {
      "session.verifySessionOwnership": {
        sessionId: SESSION_ID,
        userId: TEST_USER_ID,
      },
    },
    db: () => testDs,
    expectError: "Dataset not found",
  });

  defineTest({
    name: "should handle dataset with no column mappings",
    action: previewDatasetAction,
    params: { id: DATASET_ID },
    meta: TEST_META,
    callStubs: {
      "session.verifySessionOwnership": {
        sessionId: SESSION_ID,
        userId: TEST_USER_ID,
      },
    },
    db: () => testDs,
    before: [
      {
        entity: OriginalFile,
        data: [
          {
            id: FILE_ID,
            sessionId: SESSION_ID,
            filename: "empty.csv",
            mimeType: "text/csv",
            fileSize: 256,
            fileHash: "nocol123",
            storagePath: "/tmp/empty.csv",
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
            name: "No Columns",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.PENDING,
            rowCount: 0,
            columnCount: 0,
            columnMappings: null,
            sourceFileHash: "nocol123",
            importedAt: new Date(),
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.columns).toHaveLength(0);
      expect(result.rows).toHaveLength(0);
    },
  });
});
