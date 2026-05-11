/**
 * Tests for dataset/listDatasets.action.ts
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

import listDatasetsAction from "../listDatasets.action";

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
const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const TEST_META = {
  user: {
    id: TEST_USER_ID,
    email: "test@example.com",
    nickName: "Test User",
    isActive: true,
    isVerified: false,
  },
};

describe("dataset.listDatasets action", () => {
  defineTest({
    name: "should return empty array when no datasets exist",
    action: listDatasetsAction,
    params: { sessionId: SESSION_ID },
    meta: TEST_META,
    callStubs: {
      "session.verifySessionOwnership": {
        sessionId: SESSION_ID,
        userId: TEST_USER_ID,
      },
    },
    db: () => testDs,
    assertResult: (result) => {
      expect(result).toHaveLength(0);
    },
  });

  defineTest({
    name: "should return datasets for a session",
    action: listDatasetsAction,
    params: { sessionId: SESSION_ID },
    meta: TEST_META,
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
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Test Dataset",
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
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test Dataset");
      expect(result[0].sessionId).toBe(SESSION_ID);
    },
  });
});
