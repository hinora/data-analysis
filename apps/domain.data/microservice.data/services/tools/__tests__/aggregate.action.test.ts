/**
 * Tests for tools/aggregate.action.ts
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

import aggregateAction from "../aggregate.action";

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
      name: "Sales",
      fileType: FileType.CSV,
      datasetType: DatasetType.STRUCTURED_TABLE,
      metadataStatus: MetadataStatus.READY,
      rowCount: 6,
      columnCount: 3,
      sourceFileHash: "abc123",
      importedAt: new Date(),
    },
  ],
};

const SEED_RECORDS = {
  entity: DataRecord,
  data: [
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { region: "North", product: "A", revenue: "100" } },
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { region: "North", product: "B", revenue: "200" } },
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { region: "South", product: "A", revenue: "150" } },
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { region: "South", product: "B", revenue: "250" } },
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { region: "North", product: "A", revenue: "50" } },
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { region: "South", product: "A", revenue: "300" } },
  ],
};

describe("tools.aggregate action", () => {
  defineTest({
    name: "should compute sum aggregation without groupBy",
    action: aggregateAction,
    params: {
      datasetId: DATASET_ID,
      aggregations: [{ field: "revenue", operation: "sum" }],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.results).toHaveLength(1);
      expect(Number(result.results[0].revenue_sum)).toBe(1050);
      expect(result.truncated).toBe(false);
    },
  });

  defineTest({
    name: "should compute avg aggregation with groupBy",
    action: aggregateAction,
    params: {
      datasetId: DATASET_ID,
      aggregations: [{ field: "revenue", operation: "avg" }],
      groupBy: ["region"],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.results).toHaveLength(2);
      expect(result.totalGroups).toBe(2);
      const north = result.results.find((r: Record<string, unknown>) => r.region === "North");
      const south = result.results.find((r: Record<string, unknown>) => r.region === "South");
      expect(north).toBeDefined();
      expect(south).toBeDefined();
    },
  });

  defineTest({
    name: "should compute count aggregation",
    action: aggregateAction,
    params: {
      datasetId: DATASET_ID,
      aggregations: [{ field: "product", operation: "count" }],
      groupBy: ["region"],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.results).toHaveLength(2);
      const north = result.results.find((r: Record<string, unknown>) => r.region === "North");
      expect(Number(north?.product_count)).toBe(3);
    },
  });

  defineTest({
    name: "should apply simple filters",
    action: aggregateAction,
    params: {
      datasetId: DATASET_ID,
      aggregations: [{ field: "revenue", operation: "sum" }],
      filters: { region: "North" },
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.results).toHaveLength(1);
      // North: 100 + 200 + 50 = 350
      expect(Number(result.results[0].revenue_sum)).toBe(350);
    },
  });

  defineTest({
    name: "should apply conditions with eq operator",
    action: aggregateAction,
    params: {
      datasetId: DATASET_ID,
      aggregations: [{ field: "revenue", operation: "sum" }],
      conditions: [{ field: "product", operator: "eq", value: "A" }],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.results).toHaveLength(1);
      // Product A: 100 + 150 + 50 + 300 = 600
      expect(Number(result.results[0].revenue_sum)).toBe(600);
    },
  });

  defineTest({
    name: "should compute min and max aggregations",
    action: aggregateAction,
    params: {
      datasetId: DATASET_ID,
      aggregations: [
        { field: "revenue", operation: "min" },
        { field: "revenue", operation: "max" },
      ],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.results).toHaveLength(1);
      expect(Number(result.results[0].revenue_min)).toBe(50);
      expect(Number(result.results[0].revenue_max)).toBe(300);
    },
  });
});
