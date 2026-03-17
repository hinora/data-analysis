/**
 * Tests for tools/detectOutliers.action.ts
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

import detectOutliersAction from "../detectOutliers.action";

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
      name: "Numbers",
      fileType: FileType.CSV,
      datasetType: DatasetType.STRUCTURED_TABLE,
      metadataStatus: MetadataStatus.READY,
      rowCount: 12,
      columnCount: 1,
      sourceFileHash: "abc123",
      importedAt: new Date(),
    },
  ],
};

describe("tools.detectOutliers action", () => {
  defineTest({
    name: "should detect outliers using z-score method",
    action: detectOutliersAction,
    params: { datasetId: DATASET_ID, field: "value", method: "zscore", threshold: 2 },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [
      SEED_FILE,
      SEED_DATASET,
      {
        entity: DataRecord,
        data: [
          ...Array.from({ length: 10 }, (_, i) => ({
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { value: String(10 + i) },
          })),
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { value: "1000" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { value: "-500" } },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.method).toBe("zscore");
      expect(result.field).toBe("value");
      expect(result.mean).toBeDefined();
      expect(result.stddev).toBeDefined();
      expect(result.outlierCount).toBeGreaterThan(0);
    },
  });

  defineTest({
    name: "should throw error for non-numeric field",
    action: detectOutliersAction,
    params: { datasetId: DATASET_ID, field: "name" },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [
      SEED_FILE,
      SEED_DATASET,
      {
        entity: DataRecord,
        data: [
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "Alice" } },
          { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "Bob" } },
        ],
      },
    ],
    expectError: "non-numeric",
  });
});
