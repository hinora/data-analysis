/**
 * Tests for dataset/verifyDatasetOwnership.action.ts
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

import verifyDatasetOwnershipAction from "../verifyDatasetOwnership.action";

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

describe("dataset.verifyDatasetOwnership action", () => {
  defineTest({
    name: "should succeed when dataset belongs to user's session",
    action: verifyDatasetOwnershipAction,
    params: { datasetId: DATASET_ID, userId: TEST_USER_ID },
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
            name: "Test Data",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 100,
            columnCount: 5,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.datasetId).toBe(DATASET_ID);
      expect(result.sessionId).toBe(SESSION_ID);
      expect(result.userId).toBe(TEST_USER_ID);
    },
  });

  defineTest({
    name: "should throw 404 when dataset does not exist",
    action: verifyDatasetOwnershipAction,
    params: {
      datasetId: "00000000-0000-4000-8000-000000000000",
      userId: TEST_USER_ID,
    },
    callStubs: {
      "session.verifySessionOwnership": {
        sessionId: SESSION_ID,
        userId: TEST_USER_ID,
      },
    },
    db: () => testDs,
    expectError: "Dataset not found",
  });
});
