/**
 * Tests for tools/pivotTable.action.ts
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

import pivotTableAction from "../pivotTable.action";

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
    {
      datasetId: DATASET_ID,
      sessionId: SESSION_ID,
      data: { region: "North", quarter: "Q1", revenue: "100" },
    },
    {
      datasetId: DATASET_ID,
      sessionId: SESSION_ID,
      data: { region: "North", quarter: "Q2", revenue: "200" },
    },
    {
      datasetId: DATASET_ID,
      sessionId: SESSION_ID,
      data: { region: "South", quarter: "Q1", revenue: "150" },
    },
    {
      datasetId: DATASET_ID,
      sessionId: SESSION_ID,
      data: { region: "South", quarter: "Q2", revenue: "250" },
    },
    {
      datasetId: DATASET_ID,
      sessionId: SESSION_ID,
      data: { region: "North", quarter: "Q1", revenue: "50" },
    },
    {
      datasetId: DATASET_ID,
      sessionId: SESSION_ID,
      data: { region: "South", quarter: "Q1", revenue: "100" },
    },
  ],
};

describe("tools.pivotTable action", () => {
  defineTest({
    name: "should create a pivot table with sum aggregation",
    action: pivotTableAction,
    params: {
      datasetId: DATASET_ID,
      rowField: "region",
      columnField: "quarter",
      valueField: "revenue",
      aggregation: "sum",
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.rowField).toBe("region");
      expect(result.columnField).toBe("quarter");
      expect(result.valueField).toBe("revenue");
      expect(result.aggregation).toBe("sum");
      expect(result.columns).toContain("Q1");
      expect(result.columns).toContain("Q2");
      expect(result.results).toHaveLength(2);

      const north = result.results.find(
        (r: Record<string, unknown>) => r.region === "North",
      );
      const south = result.results.find(
        (r: Record<string, unknown>) => r.region === "South",
      );
      expect(north).toBeDefined();
      expect(south).toBeDefined();
      // North Q1: 100 + 50 = 150, North Q2: 200
      expect(Number(north!.Q1)).toBe(150);
      expect(Number(north!.Q2)).toBe(200);
      // South Q1: 150 + 100 = 250, South Q2: 250
      expect(Number(south!.Q1)).toBe(250);
      expect(Number(south!.Q2)).toBe(250);
    },
  });

  defineTest({
    name: "should create pivot table with count aggregation",
    action: pivotTableAction,
    params: {
      datasetId: DATASET_ID,
      rowField: "region",
      columnField: "quarter",
      valueField: "revenue",
      aggregation: "count",
    },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET, SEED_RECORDS],
    assertResult: (result: any) => {
      expect(result.aggregation).toBe("count");
      expect(result.results).toHaveLength(2);
      const north = result.results.find(
        (r: Record<string, unknown>) => r.region === "North",
      );
      // North has 2 Q1 entries, 1 Q2 entry
      expect(Number(north!.Q1)).toBe(2);
      expect(Number(north!.Q2)).toBe(1);
    },
  });
});
