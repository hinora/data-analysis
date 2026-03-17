/**
 * Tests for tools/getPercentile.action.ts
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

import getPercentileAction from "../getPercentile.action";

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
      rowCount: 10,
      columnCount: 1,
      sourceFileHash: "abc123",
      importedAt: new Date(),
    },
  ],
};

describe("tools.getPercentile action", () => {
  defineTest({
    name: "should return percentile values for numeric field",
    action: getPercentileAction,
    params: {
      datasetId: DATASET_ID,
      field: "value",
      percentiles: [25, 50, 75],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [
      SEED_FILE,
      SEED_DATASET,
      {
        entity: DataRecord,
        data: Array.from({ length: 100 }, (_, i) => ({
          datasetId: DATASET_ID,
          sessionId: SESSION_ID,
          data: { value: String(i + 1) },
        })),
      },
    ],
    assertResult: (result: any) => {
      expect(result.field).toBe("value");
      expect(result.p25).toBeDefined();
      expect(result.p50).toBeDefined();
      expect(result.p75).toBeDefined();
      // With 1..100, p50 should be approximately 50.5
      expect(Number(result.p50)).toBeCloseTo(50.5, 0);
    },
  });

  defineTest({
    name: "should use default percentiles when not specified",
    action: getPercentileAction,
    params: { datasetId: DATASET_ID, field: "value" },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [
      SEED_FILE,
      SEED_DATASET,
      {
        entity: DataRecord,
        data: Array.from({ length: 20 }, (_, i) => ({
          datasetId: DATASET_ID,
          sessionId: SESSION_ID,
          data: { value: String((i + 1) * 5) },
        })),
      },
    ],
    assertResult: (result: any) => {
      expect(result.p25).toBeDefined();
      expect(result.p50).toBeDefined();
      expect(result.p75).toBeDefined();
      expect(result.p90).toBeDefined();
      expect(result.p95).toBeDefined();
      expect(result.p99).toBeDefined();
      expect(result.count).toBeDefined();
    },
  });

  defineTest({
    name: "should throw error for non-numeric field",
    action: getPercentileAction,
    params: { datasetId: DATASET_ID, field: "name" },
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
            data: { name: "Alice" },
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { name: "Bob" },
          },
        ],
      },
    ],
    expectError: "non-numeric",
  });
});
