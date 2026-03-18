/**
 * Tests for tools/numericFieldUtils.ts
 *
 * Covers pure utility functions (numericWhereClause) and DB-dependent
 * functions (isFieldNumeric, assertFieldIsNumeric, getNumericCastExpr).
 */

import { AILog } from "core.lib/database";
import {
  clearTestDatabase,
  createTestDataSource,
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
import {
  assertFieldIsNumeric,
  getNumericCastExpr,
  isFieldNumeric,
  numericWhereClause,
} from "../numericFieldUtils";

let testDs: DataSource;

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

async function seedDataset() {
  const fileRepo = testDs.getRepository(OriginalFile);
  await fileRepo.save(
    fileRepo.create({
      id: FILE_ID,
      sessionId: SESSION_ID,
      filename: "test.csv",
      mimeType: "text/csv",
      fileSize: 1024,
      fileHash: "abc123",
      storagePath: "/tmp/test.csv",
    }),
  );

  const dsRepo = testDs.getRepository(Dataset);
  await dsRepo.save(
    dsRepo.create({
      id: DATASET_ID,
      sessionId: SESSION_ID,
      originalFileId: FILE_ID,
      name: "Test Data",
      fileType: FileType.CSV,
      datasetType: DatasetType.STRUCTURED_TABLE,
      metadataStatus: MetadataStatus.READY,
      rowCount: 0,
      columnCount: 2,
      sourceFileHash: "abc123",
      importedAt: new Date(),
    }),
  );
}

async function seedRecords(records: Record<string, string>[]) {
  const repo = testDs.getRepository(DataRecord);
  for (const data of records) {
    await repo.save(
      repo.create({ datasetId: DATASET_ID, sessionId: SESSION_ID, data }),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// numericWhereClause (pure)
// ═══════════════════════════════════════════════════════════════════════════
describe("numericWhereClause", () => {
  it("should build clause with table alias", () => {
    const clause = numericWhereClause({ field: "price", tableAlias: "r" });
    expect(clause).toBe(
      "r.data->>'price' IS NOT NULL AND TRIM(r.data->>'price') != ''",
    );
  });

  it("should build clause without table alias", () => {
    const clause = numericWhereClause({ field: "amount" });
    expect(clause).toBe(
      "data->>'amount' IS NOT NULL AND TRIM(data->>'amount') != ''",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isFieldNumeric (DB-dependent)
// ═══════════════════════════════════════════════════════════════════════════
describe("isFieldNumeric", () => {
  it("should return true for numeric field", async () => {
    await seedDataset();
    await seedRecords([
      { price: "10.5" },
      { price: "20" },
      { price: "30.99" },
      { price: "40" },
      { price: "50.1" },
    ]);

    const repo = testDs.getRepository(DataRecord);
    const result = await isFieldNumeric({
      datasetId: DATASET_ID,
      field: "price",
      repo,
    });
    expect(result).toBe(true);
  });

  it("should return false for non-numeric field", async () => {
    await seedDataset();
    await seedRecords([
      { name: "Alice" },
      { name: "Bob" },
      { name: "Charlie" },
    ]);

    const repo = testDs.getRepository(DataRecord);
    const result = await isFieldNumeric({
      datasetId: DATASET_ID,
      field: "name",
      repo,
    });
    expect(result).toBe(false);
  });

  it("should return false when no records exist", async () => {
    await seedDataset();

    const repo = testDs.getRepository(DataRecord);
    const result = await isFieldNumeric({
      datasetId: DATASET_ID,
      field: "price",
      repo,
    });
    expect(result).toBe(false);
  });

  it("should handle currency-formatted numbers", async () => {
    await seedDataset();
    await seedRecords([
      { price: "$10.50" },
      { price: "$20.00" },
      { price: "$30.99" },
    ]);

    const repo = testDs.getRepository(DataRecord);
    const result = await isFieldNumeric({
      datasetId: DATASET_ID,
      field: "price",
      repo,
    });
    expect(result).toBe(true);
  });

  it("should handle mixed numeric and non-numeric values based on threshold", async () => {
    await seedDataset();
    // 3 numeric + 2 non-numeric = 60% numeric, above 50% threshold
    await seedRecords([
      { val: "10" },
      { val: "20" },
      { val: "30" },
      { val: "abc" },
      { val: "def" },
    ]);

    const repo = testDs.getRepository(DataRecord);
    const result = await isFieldNumeric({
      datasetId: DATASET_ID,
      field: "val",
      repo,
    });
    expect(result).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// assertFieldIsNumeric (DB-dependent)
// ═══════════════════════════════════════════════════════════════════════════
describe("assertFieldIsNumeric", () => {
  it("should not throw for numeric field", async () => {
    await seedDataset();
    await seedRecords([{ price: "10" }, { price: "20" }, { price: "30" }]);

    const repo = testDs.getRepository(DataRecord);
    await expect(
      assertFieldIsNumeric({
        datasetId: DATASET_ID,
        field: "price",
        repo,
        toolName: "aggregate",
      }),
    ).resolves.not.toThrow();
  });

  it("should throw MoleculerClientError for non-numeric field", async () => {
    await seedDataset();
    await seedRecords([
      { name: "Alice" },
      { name: "Bob" },
      { name: "Charlie" },
    ]);

    const repo = testDs.getRepository(DataRecord);
    await expect(
      assertFieldIsNumeric({
        datasetId: DATASET_ID,
        field: "name",
        repo,
        toolName: "aggregate",
      }),
    ).rejects.toThrow("non-numeric");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getNumericCastExpr (DB-dependent)
// ═══════════════════════════════════════════════════════════════════════════
describe("getNumericCastExpr", () => {
  it("should return standard cast for dot-decimal values", async () => {
    await seedDataset();
    await seedRecords([
      { price: "10.50" },
      { price: "20.00" },
      { price: "30.99" },
    ]);

    const repo = testDs.getRepository(DataRecord);
    const expr = await getNumericCastExpr({
      datasetId: DATASET_ID,
      field: "price",
      repo,
      tableAlias: "r",
    });
    expect(expr).toContain("::numeric");
    expect(expr).toContain("r.data->>'price'");
  });

  it("should return comma-decimal cast for European format", async () => {
    await seedDataset();
    await seedRecords([
      { price: "10,50" },
      { price: "20,00" },
      { price: "30,99" },
    ]);

    const repo = testDs.getRepository(DataRecord);
    const expr = await getNumericCastExpr({
      datasetId: DATASET_ID,
      field: "price",
      repo,
      tableAlias: "r",
    });
    expect(expr).toContain("REPLACE");
    expect(expr).toContain("::numeric");
  });

  it("should work without table alias", async () => {
    await seedDataset();
    await seedRecords([{ amount: "100" }]);

    const repo = testDs.getRepository(DataRecord);
    const expr = await getNumericCastExpr({
      datasetId: DATASET_ID,
      field: "amount",
      repo,
    });
    expect(expr).toContain("data->>'amount'");
    expect(expr).not.toContain("r.data");
  });
});
