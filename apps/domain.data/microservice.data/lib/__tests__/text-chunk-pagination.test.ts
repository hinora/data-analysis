/**
 * Tests for lib/text-chunk-pagination.ts
 *
 * Covers the scanTextChunkPages utility using a real test database.
 */

import { AILog } from "core.lib/database";
import {
  clearTestDatabase,
  createTestDataSource,
  destroyTestDataSource,
} from "core.lib/testing";
import type { DataSource } from "typeorm";
import { DataRecord } from "../../db/data-record.entity";
import {
  Dataset,
  DatasetType,
  FileType,
  MetadataStatus,
} from "../../db/dataset.entity";
import { OriginalFile } from "../../db/original-file.entity";
import { TextChunk } from "../../db/text-chunk.entity";
import { scanTextChunkPages } from "../text-chunk-pagination";

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
    TextChunk,
    DataRecord,
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
      filename: "test.pdf",
      mimeType: "application/pdf",
      fileSize: 2048,
      fileHash: "xyz789",
      storagePath: "/tmp/test.pdf",
    }),
  );

  const dsRepo = testDs.getRepository(Dataset);
  await dsRepo.save(
    dsRepo.create({
      id: DATASET_ID,
      sessionId: SESSION_ID,
      originalFileId: FILE_ID,
      name: "Test PDF",
      fileType: FileType.PDF,
      datasetType: DatasetType.UNSTRUCTURED_TEXT,
      metadataStatus: MetadataStatus.READY,
      rowCount: 0,
      columnCount: 0,
      sourceFileHash: "xyz789",
      importedAt: new Date(),
    }),
  );
}

async function seedChunks(count: number) {
  const chunkRepo = testDs.getRepository(TextChunk);
  for (let i = 0; i < count; i++) {
    await chunkRepo.save(
      chunkRepo.create({
        datasetId: DATASET_ID,
        sessionId: SESSION_ID,
        orderIndex: i,
        content: `Chunk ${i} content`,
      }),
    );
  }
}

describe("scanTextChunkPages", () => {
  it("should return zero total when no chunks exist", async () => {
    await seedDataset();

    const chunkRepo = testDs.getRepository(TextChunk);
    const onPage = jest.fn();

    const result = await scanTextChunkPages({
      chunkRepo,
      datasetId: DATASET_ID,
      onPage,
    });

    expect(result.totalChunks).toBe(0);
    expect(onPage).not.toHaveBeenCalled();
  });

  it("should scan all chunks in a single page when under page size", async () => {
    await seedDataset();
    await seedChunks(3);

    const chunkRepo = testDs.getRepository(TextChunk);
    const pages: { page: number; chunkCount: number }[] = [];

    const result = await scanTextChunkPages({
      chunkRepo,
      datasetId: DATASET_ID,
      onPage: async ({ chunks, page, totalChunks }) => {
        pages.push({ page, chunkCount: chunks.length });
        expect(totalChunks).toBe(3);
      },
      pageSize: 10,
    });

    expect(result.totalChunks).toBe(3);
    expect(pages).toEqual([{ page: 0, chunkCount: 3 }]);
  });

  it("should paginate across multiple pages", async () => {
    await seedDataset();
    await seedChunks(5);

    const chunkRepo = testDs.getRepository(TextChunk);
    const pages: { page: number; chunkCount: number }[] = [];

    const result = await scanTextChunkPages({
      chunkRepo,
      datasetId: DATASET_ID,
      onPage: async ({ chunks, page }) => {
        pages.push({ page, chunkCount: chunks.length });
      },
      pageSize: 2,
    });

    expect(result.totalChunks).toBe(5);
    expect(pages).toEqual([
      { page: 0, chunkCount: 2 },
      { page: 1, chunkCount: 2 },
      { page: 2, chunkCount: 1 },
    ]);
  });

  it("should return chunks ordered by orderIndex", async () => {
    await seedDataset();
    await seedChunks(3);

    const chunkRepo = testDs.getRepository(TextChunk);
    const allChunks: string[] = [];

    await scanTextChunkPages({
      chunkRepo,
      datasetId: DATASET_ID,
      onPage: async ({ chunks }) => {
        for (const chunk of chunks) {
          allChunks.push(chunk.content);
        }
      },
      pageSize: 10,
    });

    expect(allChunks).toEqual([
      "Chunk 0 content",
      "Chunk 1 content",
      "Chunk 2 content",
    ]);
  });

  it("should use default page size when not specified", async () => {
    await seedDataset();
    await seedChunks(3);

    const chunkRepo = testDs.getRepository(TextChunk);
    const pages: number[] = [];

    await scanTextChunkPages({
      chunkRepo,
      datasetId: DATASET_ID,
      onPage: async ({ page }) => {
        pages.push(page);
      },
    });

    // With default page size of 100, 3 chunks fit in one page
    expect(pages).toEqual([0]);
  });
});
