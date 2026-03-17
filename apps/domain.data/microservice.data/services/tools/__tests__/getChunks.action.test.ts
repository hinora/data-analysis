/**
 * Tests for tools/getChunks.action.ts
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

import getChunksAction from "../getChunks.action";

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
      filename: "doc.pdf",
      mimeType: "application/pdf",
      fileSize: 2048,
      fileHash: "pdf123",
      storagePath: "/tmp/doc.pdf",
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
      name: "Document",
      fileType: FileType.PDF,
      datasetType: DatasetType.UNSTRUCTURED_TEXT,
      metadataStatus: MetadataStatus.READY,
      rowCount: 5,
      columnCount: null,
      sourceFileHash: "pdf123",
      importedAt: new Date(),
    },
  ],
};

describe("tools.getChunks action", () => {
  defineTest({
    name: "should return text chunks ordered by index",
    action: getChunksAction,
    params: { datasetId: DATASET_ID },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [
      SEED_FILE,
      SEED_DATASET,
      {
        entity: TextChunk,
        data: [
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            content: "Chunk 0",
            orderIndex: 0,
            sourcePage: 1,
            sourceSection: "Introduction",
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            content: "Chunk 1",
            orderIndex: 1,
            sourcePage: 1,
            sourceSection: "Introduction",
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            content: "Chunk 2",
            orderIndex: 2,
            sourcePage: 2,
            sourceSection: "Body",
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            content: "Chunk 3",
            orderIndex: 3,
            sourcePage: 2,
            sourceSection: "Body",
          },
          {
            datasetId: DATASET_ID,
            sessionId: SESSION_ID,
            content: "Chunk 4",
            orderIndex: 4,
            sourcePage: 3,
            sourceSection: "Conclusion",
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.totalChunks).toBe(5);
      expect(result.count).toBe(5);
      expect(result.chunks).toHaveLength(5);
      expect(result.chunks[0].content).toBe("Chunk 0");
      expect(result.chunks[0].orderIndex).toBe(0);
      expect(result.chunks[0].sourcePage).toBe(1);
      expect(result.chunks[0].sourceSection).toBe("Introduction");
      expect(result.chunks[4].content).toBe("Chunk 4");
    },
  });

  defineTest({
    name: "should return chunks within specified range",
    action: getChunksAction,
    params: { datasetId: DATASET_ID, startIndex: 1, endIndex: 3 },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [
      SEED_FILE,
      SEED_DATASET,
      {
        entity: TextChunk,
        data: Array.from({ length: 5 }, (_, i) => ({
          datasetId: DATASET_ID,
          sessionId: SESSION_ID,
          content: `Chunk ${i}`,
          orderIndex: i,
          sourcePage: null,
          sourceSection: null,
        })),
      },
    ],
    assertResult: (result: any) => {
      expect(result.totalChunks).toBe(5);
      expect(result.count).toBe(3);
      expect(result.chunks[0].orderIndex).toBe(1);
      expect(result.chunks[2].orderIndex).toBe(3);
    },
  });

  defineTest({
    name: "should return empty chunks for dataset with no text content",
    action: getChunksAction,
    params: { datasetId: DATASET_ID },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [SEED_FILE, SEED_DATASET],
    assertResult: (result: any) => {
      expect(result.totalChunks).toBe(0);
      expect(result.chunks).toHaveLength(0);
      expect(result.message).toBe("No text content found for this dataset.");
    },
  });

  defineTest({
    name: "should respect limit parameter",
    action: getChunksAction,
    params: { datasetId: DATASET_ID, limit: 2 },
    db: () => testDs,
    callStubs: { "dataset.getDataset": { id: DATASET_ID } },
    before: [
      SEED_FILE,
      SEED_DATASET,
      {
        entity: TextChunk,
        data: Array.from({ length: 10 }, (_, i) => ({
          datasetId: DATASET_ID,
          sessionId: SESSION_ID,
          content: `Chunk ${i}`,
          orderIndex: i,
          sourcePage: null,
          sourceSection: null,
        })),
      },
    ],
    assertResult: (result: any) => {
      expect(result.totalChunks).toBe(10);
      expect(result.count).toBe(2);
      expect(result.chunks).toHaveLength(2);
    },
  });
});
