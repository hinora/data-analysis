/**
 * Tests for tools/filterByCondition.action.ts
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

import filterByConditionAction from "../filterByCondition.action";

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
      name: "Products",
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

const SEED_RECORDS = {
  entity: DataRecord,
  data: [
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "Apple", category: "Fruit", price: "1.50" } },
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "Banana", category: "Fruit", price: "0.75" } },
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "Carrot", category: "Vegetable", price: "2.00" } },
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "Donut", category: "Snack", price: "3.50" } },
    { datasetId: DATASET_ID, sessionId: SESSION_ID, data: { name: "Eggplant", category: "Vegetable", price: "4.00" } },
  ],
};

describe("tools.filterByCondition action", () => {
  defineTest({
    name: "should filter by equality condition",
    action: filterByConditionAction,
    params: {
      datasetId: DATASET_ID,
      conditions: [{ field: "category", operator: "eq", value: "Fruit" }],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.count).toBe(2);
      expect(result.results.every((r: Record<string, unknown>) => r.category === "Fruit")).toBe(true);
    },
  });

  defineTest({
    name: "should filter by neq condition",
    action: filterByConditionAction,
    params: {
      datasetId: DATASET_ID,
      conditions: [{ field: "category", operator: "neq", value: "Fruit" }],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.count).toBe(3);
      expect(result.results.every((r: Record<string, unknown>) => r.category !== "Fruit")).toBe(true);
    },
  });

  defineTest({
    name: "should filter by contains condition (case-insensitive)",
    action: filterByConditionAction,
    params: {
      datasetId: DATASET_ID,
      conditions: [{ field: "name", operator: "contains", value: "an" }],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      // "Banana" and "Eggplant" contain "an"
      expect(result.count).toBe(2);
    },
  });

  defineTest({
    name: "should filter by gt condition on numeric field",
    action: filterByConditionAction,
    params: {
      datasetId: DATASET_ID,
      conditions: [{ field: "price", operator: "gt", value: 2 }],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      // price > 2: Donut (3.50), Eggplant (4.00)
      expect(result.count).toBe(2);
    },
  });

  defineTest({
    name: "should filter by in condition",
    action: filterByConditionAction,
    params: {
      datasetId: DATASET_ID,
      conditions: [
        { field: "category", operator: "in", value: ["Fruit", "Snack"] },
      ],
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      // Apple, Banana (Fruit), Donut (Snack)
      expect(result.count).toBe(3);
    },
  });

  defineTest({
    name: "should respect limit parameter",
    action: filterByConditionAction,
    params: {
      datasetId: DATASET_ID,
      conditions: [{ field: "category", operator: "neq", value: "NONE" }],
      limit: 2,
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.count).toBe(2);
      expect(result.limit).toBe(2);
    },
  });
});
