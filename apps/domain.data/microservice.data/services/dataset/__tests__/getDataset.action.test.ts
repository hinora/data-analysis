/**
 * Tests for dataset/getDataset.action.ts
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

import getDatasetAction from "../getDataset.action";

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

const SESSION_STUB = { id: SESSION_ID, name: "Test Session" };

describe("dataset.getDataset action", () => {
  defineTest({
    name: "should return a dataset when found",
    action: getDatasetAction,
    params: { id: DATASET_ID },
    db: () => testDs,
    callStubs: {
      "session.getSession": SESSION_STUB,
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
            name: "Sales Data",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 500,
            columnCount: 10,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.id).toBe(DATASET_ID);
      expect(result.name).toBe("Sales Data");
      expect(result.fileType).toBe(FileType.CSV);
      expect(result.rowCount).toBe(500);
    },
  });

  defineTest({
    name: "should throw 404 when dataset not found",
    action: getDatasetAction,
    params: { id: "00000000-0000-4000-8000-000000000000" },
    db: () => testDs,
    expectError: "Dataset not found",
  });
});
