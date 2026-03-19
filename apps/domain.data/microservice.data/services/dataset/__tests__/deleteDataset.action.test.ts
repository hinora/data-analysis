/**
 * Tests for dataset/deleteDataset.action.ts
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

import deleteDatasetAction from "../deleteDataset.action";

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

const TEST_META = {
  user: {
    id: TEST_USER_ID,
    email: "test@example.com",
    nickName: "Test User",
    isActive: true,
    isVerified: false,
  },
};

describe("dataset.deleteDataset action", () => {
  defineTest({
    name: "should delete a dataset and cascade records",
    action: deleteDatasetAction,
    params: { id: DATASET_ID },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
      "session.updateSessionStatus": { success: true },
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
            name: "To Delete",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 10,
            columnCount: 3,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
        ],
      },
      {
        entity: DataRecord,
        data: [
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            data: { name: "test", value: 42 },
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.success).toBe(true);
      expect(result.id).toBe(DATASET_ID);
    },
    after: [
      {
        entity: Dataset,
        assert: (datasets) => {
          expect(datasets).toHaveLength(0);
        },
      },
      {
        entity: DataRecord,
        assert: (records) => {
          expect(records).toHaveLength(0);
        },
      },
      {
        entity: OriginalFile,
        assert: (files) => {
          // OriginalFile should also be deleted (only dataset referencing it)
          expect(files).toHaveLength(0);
        },
      },
    ],
  });

  defineTest({
    name: "should not delete OriginalFile if shared by other datasets",
    action: deleteDatasetAction,
    params: { id: DATASET_ID },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
      "session.updateSessionStatus": { success: true },
    },
    before: async (ds) => {
      const fileRepo = ds.getRepository(OriginalFile);
      const datasetRepo = ds.getRepository(Dataset);

      await fileRepo.save(
        fileRepo.create({
          id: FILE_ID,
          sessionId: SESSION_ID,
          filename: "multi.xlsm",
          mimeType: "application/vnd.ms-excel",
          fileSize: 2048,
          fileHash: "shared123",
          storagePath: "/tmp/multi.xlsm",
        }),
      );

      // Two datasets sharing the same OriginalFile
      await datasetRepo.save(
        datasetRepo.create({
          id: DATASET_ID,
          sessionId: SESSION_ID,
          originalFileId: FILE_ID,
          name: "Sheet 1",
          fileType: FileType.XLSM,
          datasetType: DatasetType.STRUCTURED_TABLE,
          metadataStatus: MetadataStatus.READY,
          rowCount: 50,
          columnCount: 5,
          sourceFileHash: "shared123",
          importedAt: new Date(),
        }),
      );

      await datasetRepo.save(
        datasetRepo.create({
          sessionId: SESSION_ID,
          originalFileId: FILE_ID,
          name: "Sheet 2",
          fileType: FileType.XLSM,
          datasetType: DatasetType.STRUCTURED_TABLE,
          metadataStatus: MetadataStatus.READY,
          rowCount: 30,
          columnCount: 4,
          sourceFileHash: "shared1232",
          importedAt: new Date(),
        }),
      );
    },
    after: [
      {
        entity: OriginalFile,
        assert: (files) => {
          // OriginalFile should NOT be deleted (still referenced by Sheet 2)
          expect(files).toHaveLength(1);
        },
      },
      {
        entity: Dataset,
        assert: (datasets) => {
          expect(datasets).toHaveLength(1);
          expect(datasets[0].name).toBe("Sheet 2");
        },
      },
    ],
  });

  defineTest({
    name: "should throw 404 when dataset not found",
    action: deleteDatasetAction,
    params: { id: "00000000-0000-4000-8000-000000000000" },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
      "session.updateSessionStatus": { success: true },
    },
    expectError: "Dataset not found",
  });

  defineTest({
    name: "should handle updateSessionStatus failure gracefully",
    action: deleteDatasetAction,
    params: { id: DATASET_ID },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
      "session.updateSessionStatus": () => {
        throw new Error("Service unavailable");
      },
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
            fileHash: "grace123",
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
            name: "Graceful",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.READY,
            rowCount: 5,
            columnCount: 2,
            sourceFileHash: "grace123",
            importedAt: new Date(),
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      // Should still succeed
      expect(result.success).toBe(true);
    },
  });
});
