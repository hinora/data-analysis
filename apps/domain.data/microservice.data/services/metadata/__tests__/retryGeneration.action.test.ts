/**
 * Tests for metadata/retryGeneration.action.ts
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

import retryGenerationAction from "../retryGeneration.action";

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

describe("metadata.retryGeneration action", () => {
  defineTest({
    name: "should retry generation for failed dataset",
    action: retryGenerationAction,
    params: { datasetId: DATASET_ID },
    db: () => testDs,
    callStubs: {
      "session.getSession": SESSION_STUB,
    },
    before: [
      SEED_FILE,
      {
        entity: Dataset,
        data: [
          {
            id: DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Failed Dataset",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.FAILED,
            rowCount: 100,
            columnCount: 5,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.success).toBe(true);
      expect(result.datasetId).toBe(DATASET_ID);
    },
    after: [
      {
        entity: Dataset,
        assert: (datasets: Dataset[]) => {
          const dataset = datasets.find((d) => d.id === DATASET_ID);
          expect(dataset).toBeDefined();
          expect(dataset!.metadataStatus).toBe(MetadataStatus.PENDING);
        },
      },
    ],
  });

  defineTest({
    name: "should throw 404 for non-existent dataset",
    action: retryGenerationAction,
    params: { datasetId: "00000000-0000-4000-8000-000000000000" },
    db: () => testDs,
    expectError: "Dataset not found",
  });

  defineTest({
    name: "should throw 400 when dataset status is not failed",
    action: retryGenerationAction,
    params: { datasetId: DATASET_ID },
    db: () => testDs,
    callStubs: {
      "session.getSession": SESSION_STUB,
    },
    before: [
      SEED_FILE,
      {
        entity: Dataset,
        data: [
          {
            id: DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Ready Dataset",
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
    expectError:
      "Can only retry metadata generation for datasets with 'failed' status",
  });

  defineTest({
    name: "should throw 400 when dataset status is pending",
    action: retryGenerationAction,
    params: { datasetId: DATASET_ID },
    db: () => testDs,
    callStubs: {
      "session.getSession": SESSION_STUB,
    },
    before: [
      SEED_FILE,
      {
        entity: Dataset,
        data: [
          {
            id: DATASET_ID,
            sessionId: SESSION_ID,
            originalFileId: FILE_ID,
            name: "Pending Dataset",
            fileType: FileType.CSV,
            datasetType: DatasetType.STRUCTURED_TABLE,
            metadataStatus: MetadataStatus.PENDING,
            rowCount: 100,
            columnCount: 5,
            sourceFileHash: "abc123",
            importedAt: new Date(),
          },
        ],
      },
    ],
    expectError:
      "Can only retry metadata generation for datasets with 'failed' status",
  });
});
