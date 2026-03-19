/**
 * Tests for upload/importFromUrl.action.ts
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

import importFromUrlAction from "../importFromUrl.action";

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
const MOCK_URL = "https://example.com/test-page";
const MOCK_CONTENT =
  "This is a test web page with some meaningful content. " +
  "It contains several paragraphs of text that should be chunked. " +
  "The content is long enough to create at least one text chunk for testing purposes.";
const MOCK_TITLE = "Test Page Title";

describe("upload.importFromUrl action", () => {
  defineTest({
    name: "should import content from a URL and create dataset with text chunks",
    action: importFromUrlAction,
    params: {
      sessionId: SESSION_ID,
      url: MOCK_URL,
    },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
      "tools.webFetch": {
        content: MOCK_CONTENT,
        title: MOCK_TITLE,
        url: MOCK_URL,
        contentLength: MOCK_CONTENT.length,
        truncated: false,
      },
      "session.updateSessionStatus": { success: true },
    },
    assertResult: (result) => {
      expect(result.originalFileId).toBeDefined();
      expect(result.datasets).toHaveLength(1);
      expect(result.datasets[0].name).toContain("Test Page Title");
      expect(result.datasets[0].name).toContain("Web Import");
      expect(result.datasets[0].datasetType).toBe("unstructured-text");
      expect(result.datasets[0].rowCount).toBeGreaterThan(0);
      expect(result.datasets[0].columnCount).toBeNull();
    },
    after: [
      {
        entity: OriginalFile,
        assert: (records) => {
          expect(records).toHaveLength(1);
          expect(records[0].sessionId).toBe(SESSION_ID);
          expect(records[0].filename).toBe(MOCK_TITLE);
          expect(records[0].mimeType).toBe("text/html");
          expect(records[0].storagePath).toBe(MOCK_URL);
        },
      },
      {
        entity: Dataset,
        assert: (records) => {
          expect(records).toHaveLength(1);
          expect(records[0].fileType).toBe(FileType.URL);
          expect(records[0].datasetType).toBe(DatasetType.UNSTRUCTURED_TEXT);
          expect(records[0].metadataStatus).toBe(MetadataStatus.PENDING);
          expect(records[0].sessionId).toBe(SESSION_ID);
        },
      },
      {
        entity: TextChunk,
        assert: (records) => {
          expect(records.length).toBeGreaterThan(0);
          expect(records[0].sessionId).toBe(SESSION_ID);
          expect(records[0].content).toBeDefined();
          expect(records[0].content.length).toBeGreaterThan(0);
        },
      },
    ],
  });

  defineTest({
    name: "should reject invalid sessionId",
    action: importFromUrlAction,
    params: {
      sessionId: "invalid-id",
      url: MOCK_URL,
    },
    meta: TEST_META,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
    },
    expectError: "Invalid or missing sessionId",
  });

  defineTest({
    name: "should reject invalid URL",
    action: importFromUrlAction,
    params: {
      sessionId: SESSION_ID,
      url: "not-a-url",
    },
    meta: TEST_META,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
    },
    expectError: "Invalid URL",
  });

  defineTest({
    name: "should reject non-HTTP protocols",
    action: importFromUrlAction,
    params: {
      sessionId: SESSION_ID,
      url: "ftp://example.com/file",
    },
    meta: TEST_META,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
    },
    expectError: "Only http and https URLs are supported",
  });

  defineTest({
    name: "should reject empty content from URL",
    action: importFromUrlAction,
    params: {
      sessionId: SESSION_ID,
      url: MOCK_URL,
    },
    meta: TEST_META,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
      "tools.webFetch": {
        content: "",
        title: "",
        url: MOCK_URL,
        contentLength: 0,
        truncated: false,
      },
    },
    expectError: "The URL returned no text content",
  });

  defineTest({
    name: "should reject duplicate URL import",
    action: importFromUrlAction,
    params: {
      sessionId: SESSION_ID,
      url: MOCK_URL,
    },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
      "tools.webFetch": {
        content: MOCK_CONTENT,
        title: MOCK_TITLE,
        url: MOCK_URL,
        contentLength: MOCK_CONTENT.length,
        truncated: false,
      },
    },
    before: async (ds) => {
      // Pre-populate the same URL import (same hash)
      const crypto = await import("node:crypto");
      const contentHash = crypto
        .createHash("sha256")
        .update(MOCK_URL + MOCK_CONTENT)
        .digest("hex");

      const fileRepo = ds.getRepository(OriginalFile);
      await fileRepo.save(
        fileRepo.create({
          sessionId: SESSION_ID,
          filename: MOCK_TITLE,
          mimeType: "text/html",
          fileSize: Buffer.byteLength(MOCK_CONTENT, "utf-8"),
          fileHash: contentHash,
          storagePath: MOCK_URL,
        }),
      );
    },
    expectError: "This URL has already been imported to this session",
  });

  defineTest({
    name: "should handle webFetch failure gracefully",
    action: importFromUrlAction,
    params: {
      sessionId: SESSION_ID,
      url: MOCK_URL,
    },
    meta: TEST_META,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
      "tools.webFetch": () => {
        throw new Error("Connection timeout");
      },
    },
    expectError: "Failed to fetch content from URL",
  });

  defineTest({
    name: "should use hostname when title is empty",
    action: importFromUrlAction,
    params: {
      sessionId: SESSION_ID,
      url: "https://data.example.org/page",
    },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.getSession": { id: SESSION_ID, name: "Test Session" },
      "tools.webFetch": {
        content: MOCK_CONTENT,
        title: "",
        url: "https://data.example.org/page",
        contentLength: MOCK_CONTENT.length,
        truncated: false,
      },
      "session.updateSessionStatus": { success: true },
    },
    assertResult: (result) => {
      expect(result.datasets[0].name).toContain("data.example.org");
      expect(result.datasets[0].name).toContain("Web Import");
    },
  });
});
