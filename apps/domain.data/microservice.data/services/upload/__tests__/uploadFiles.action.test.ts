/**
 * Tests for upload/uploadFiles.action.ts
 */

import { AILog } from "core.lib/database";
import {
  clearTestDatabase,
  createTestContext,
  createTestDataSource,
  destroyTestDataSource,
} from "core.lib/testing";
import type { DataSource } from "typeorm";
import { DataRecord } from "../../../db/data-record.entity";
import {
  Dataset,
  DatasetType,
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

import uploadFilesAction from "../uploadFiles.action";

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

describe("upload.uploadFiles action", () => {
  it("should reject invalid sessionId", async () => {
    const ctx = createTestContext({
      params: {
        files: [
          {
            data: Buffer.from("name,age\nAlice,30"),
            filename: "test.csv",
            mimetype: "text/csv",
          },
        ],
        sessionId: "not-a-uuid",
      },
    });

    await expect(uploadFilesAction.handler(ctx as never)).rejects.toThrow(
      "Invalid or missing sessionId",
    );
  });

  it("should reject when no files are provided", async () => {
    const ctx = createTestContext({
      params: {
        files: [],
        sessionId: SESSION_ID,
      },
    });

    await expect(uploadFilesAction.handler(ctx as never)).rejects.toThrow(
      "No files provided",
    );
  });

  it("should upload a single file and create datasets", async () => {
    mockParse.mockResolvedValueOnce({
      datasets: [
        {
          columnMappings: [
            { camelCase: "name", detectedType: "string", original: "Name" },
            { camelCase: "age", detectedType: "number", original: "Age" },
          ],
          datasetType: "structured-table",
          rows: [
            { age: "30", name: "Alice" },
            { age: "25", name: "Bob" },
          ],
        },
      ],
      errors: [],
    });

    const ctx = createTestContext({
      params: {
        files: [
          {
            data: Buffer.from("Name,Age\nAlice,30\nBob,25"),
            filename: "people.csv",
            mimetype: "text/csv",
          },
        ],
        sessionId: SESSION_ID,
      },
    });

    const result = await uploadFilesAction.handler(ctx as never);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].filename).toBe("people.csv");
    expect(result.files[0].originalFileId).toBeDefined();
    expect(result.files[0].datasets).toHaveLength(1);
    expect(result.files[0].datasets[0].name).toBe("people");
    expect(result.files[0].datasets[0].datasetType).toBe(
      DatasetType.STRUCTURED_TABLE,
    );
    expect(result.files[0].datasets[0].rowCount).toBe(2);

    // Verify data was inserted
    const records = await testDs
      .getRepository(DataRecord)
      .find({ where: { datasetId: result.files[0].datasets[0].id } });
    expect(records).toHaveLength(2);

    // Verify ONE emit was called with all datasets
    expect(ctx.emit).toHaveBeenCalledTimes(1);
    expect(ctx.emit).toHaveBeenCalledWith("metadata.generateMetadata", {
      datasets: [
        {
          datasetId: result.files[0].datasets[0].id,
          datasetType: DatasetType.STRUCTURED_TABLE,
          name: "people",
        },
      ],
      sessionId: SESSION_ID,
    });
  });

  it("should upload multiple files in one request and emit one metadata event", async () => {
    // First file: CSV
    mockParse.mockResolvedValueOnce({
      datasets: [
        {
          columnMappings: [
            { camelCase: "name", detectedType: "string", original: "Name" },
          ],
          datasetType: "structured-table",
          rows: [{ name: "Alice" }],
        },
      ],
      errors: [],
    });

    // Second file: another CSV
    mockParse.mockResolvedValueOnce({
      datasets: [
        {
          columnMappings: [
            { camelCase: "city", detectedType: "string", original: "City" },
          ],
          datasetType: "structured-table",
          rows: [{ city: "NYC" }],
        },
      ],
      errors: [],
    });

    const ctx = createTestContext({
      params: {
        files: [
          {
            data: Buffer.from("Name\nAlice"),
            filename: "names.csv",
            mimetype: "text/csv",
          },
          {
            data: Buffer.from("City\nNYC"),
            filename: "cities.csv",
            mimetype: "text/csv",
          },
        ],
        sessionId: SESSION_ID,
      },
    });

    const result = await uploadFilesAction.handler(ctx as never);

    // Both files processed
    expect(result.files).toHaveLength(2);
    expect(result.files[0].filename).toBe("names.csv");
    expect(result.files[0].datasets).toHaveLength(1);
    expect(result.files[1].filename).toBe("cities.csv");
    expect(result.files[1].datasets).toHaveLength(1);

    // ONE metadata event emitted with ALL datasets from both files
    expect(ctx.emit).toHaveBeenCalledTimes(1);
    expect(ctx.emit).toHaveBeenCalledWith("metadata.generateMetadata", {
      datasets: [
        {
          datasetId: result.files[0].datasets[0].id,
          datasetType: DatasetType.STRUCTURED_TABLE,
          name: "names",
        },
        {
          datasetId: result.files[1].datasets[0].id,
          datasetType: DatasetType.STRUCTURED_TABLE,
          name: "cities",
        },
      ],
      sessionId: SESSION_ID,
    });

    // Verify datasets stored in DB
    const datasets = await testDs.getRepository(Dataset).find({
      where: { sessionId: SESSION_ID },
    });
    expect(datasets).toHaveLength(2);
    expect(datasets.every((d) => d.metadataStatus === MetadataStatus.PENDING)).toBe(true);
  });

  it("should detect duplicate files within the same batch", async () => {
    mockParse.mockResolvedValueOnce({
      datasets: [
        {
          columnMappings: [
            { camelCase: "name", detectedType: "string", original: "Name" },
          ],
          datasetType: "structured-table",
          rows: [{ name: "Alice" }],
        },
      ],
      errors: [],
    });

    const sameData = Buffer.from("Name\nAlice");

    const ctx = createTestContext({
      params: {
        files: [
          {
            data: sameData,
            filename: "data.csv",
            mimetype: "text/csv",
          },
          {
            data: sameData,
            filename: "data-copy.csv",
            mimetype: "text/csv",
          },
        ],
        sessionId: SESSION_ID,
      },
    });

    // Should fail when processing the second (duplicate) file
    await expect(uploadFilesAction.handler(ctx as never)).rejects.toThrow(
      "already been uploaded",
    );
  });
});
