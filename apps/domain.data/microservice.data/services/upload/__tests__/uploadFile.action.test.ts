/**
 * Tests for upload/uploadFile.action.ts
 */

import { AILog } from "core.lib/database";
import {
  clearTestDatabase,
  createTestDataSource,
  destroyTestDataSource,
  createTestContext,
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

const mockParse = jest.fn();
jest.mock("core.lib/adapters/file-parser", () => ({
  getParser: () => ({ parse: mockParse }),
  getSupportedFormats: () => ["csv", "pdf", "xlsx", "xlsm"],
}));

jest.mock("node:fs", () => {
  const actual = jest.requireActual("node:fs");
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  };
});

import uploadFileAction from "../uploadFile.action";

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
  jest.clearAllMocks();
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("upload.uploadFile action", () => {
  it("should reject invalid sessionId", async () => {
    const ctx = createTestContext({
      params: {},
      meta: {
        $multipart: {
          sessionId: "not-a-uuid",
          filename: "test.csv",
          mimetype: "text/csv",
          data: Buffer.from("name,age\nAlice,30"),
        },
      },
    });

    await expect(uploadFileAction.handler(ctx as any)).rejects.toThrow(
      "Invalid or missing sessionId",
    );
  });

  it("should reject unsupported file types", async () => {
    const ctx = createTestContext({
      params: {},
      meta: {
        $multipart: {
          sessionId: SESSION_ID,
          filename: "test.xyz",
          mimetype: "application/xyz",
          data: Buffer.from("some data"),
        },
      },
    });

    await expect(uploadFileAction.handler(ctx as any)).rejects.toThrow(
      "Unsupported file type",
    );
  });

  it("should reject when no file data is provided", async () => {
    const ctx = createTestContext({
      params: {},
      meta: {
        $multipart: {
          sessionId: SESSION_ID,
          filename: "test.csv",
          mimetype: "text/csv",
        },
      },
    });

    await expect(uploadFileAction.handler(ctx as any)).rejects.toThrow(
      "No file data received",
    );
  });

  it("should upload CSV file and create dataset with records", async () => {
    mockParse.mockResolvedValueOnce({
      datasets: [
        {
          datasetType: "structured-table",
          rows: [
            { name: "Alice", age: "30" },
            { name: "Bob", age: "25" },
          ],
          columnMappings: [
            { camelCase: "name", original: "Name", detectedType: "string" },
            { camelCase: "age", original: "Age", detectedType: "number" },
          ],
        },
      ],
      errors: [],
    });

    const ctx = createTestContext({
      params: {},
      meta: {
        $multipart: {
          sessionId: SESSION_ID,
          filename: "people.csv",
          mimetype: "text/csv",
          data: Buffer.from("Name,Age\nAlice,30\nBob,25"),
        },
      },
    });

    const result = await uploadFileAction.handler(ctx as any);

    expect(result.originalFileId).toBeDefined();
    expect(result.datasets).toHaveLength(1);
    expect(result.datasets[0].name).toBe("people");
    expect(result.datasets[0].datasetType).toBe(DatasetType.STRUCTURED_TABLE);
    expect(result.datasets[0].rowCount).toBe(2);
    expect(result.datasets[0].columnCount).toBe(2);

    // Verify data was inserted
    const records = await testDs
      .getRepository(DataRecord)
      .find({ where: { datasetId: result.datasets[0].id } });
    expect(records).toHaveLength(2);
  });

  it("should detect duplicate file uploads", async () => {
    mockParse.mockResolvedValue({
      datasets: [
        {
          datasetType: "structured-table",
          rows: [{ name: "Alice" }],
          columnMappings: [
            { camelCase: "name", original: "Name", detectedType: "string" },
          ],
        },
      ],
      errors: [],
    });

    const fileBuffer = Buffer.from("Name\nAlice");

    const ctx1 = createTestContext({
      params: {},
      meta: {
        $multipart: {
          sessionId: SESSION_ID,
          filename: "data.csv",
          mimetype: "text/csv",
          data: fileBuffer,
        },
      },
    });

    // First upload should succeed
    await uploadFileAction.handler(ctx1 as any);

    // Second upload with same data should fail
    const ctx2 = createTestContext({
      params: {},
      meta: {
        $multipart: {
          sessionId: SESSION_ID,
          filename: "data.csv",
          mimetype: "text/csv",
          data: fileBuffer,
        },
      },
    });

    await expect(uploadFileAction.handler(ctx2 as any)).rejects.toThrow(
      "already been uploaded",
    );
  });
});
