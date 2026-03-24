/**
 * Tests for tools/semanticSearch.action.ts
 */

import { EMBEDDING_DIMENSIONS } from "core.lib/adapters/ai";
import {
  aiDefaults,
  createMockAIAdapter,
  createTestContext,
} from "core.lib/testing";

const mockAI = createMockAIAdapter();

jest.mock("core.lib/adapters/ai", () => ({
  createAIAdapter: () => mockAI,
}));

const mockQuery = jest.fn();

jest.mock("../../../db", () => ({
  get dataSource() {
    return { query: mockQuery };
  },
}));

import semanticSearchAction from "../semanticSearch.action";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("tools.semanticSearch action", () => {
  it("should throw error when neither sessionId nor datasetId provided", async () => {
    const ctx = createTestContext({
      params: { query: "test query" },
    });

    await expect(semanticSearchAction.handler(ctx)).rejects.toThrow(
      "At least one of sessionId or datasetId must be provided",
    );
  });

  it("should return empty results when no embedding is generated", async () => {
    mockAI.generateEmbeddings.mockResolvedValueOnce({
      ...aiDefaults.embeddingsResult,
      embeddings: [],
    });

    const ctx = createTestContext({
      params: {
        query: "test query",
        datasetId: "44444444-4444-4444-8444-444444444444",
      },
      callStubs: {
        "dataset.getDataset": { id: "44444444-4444-4444-8444-444444444444" },
      },
    });

    const result: any = await semanticSearchAction.handler(ctx);

    expect(result.count).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it("should merge vector and keyword search results", async () => {
    const mockEmbedding = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
    mockAI.generateEmbeddings.mockResolvedValueOnce({
      ...aiDefaults.embeddingsResult,
      embeddings: [mockEmbedding],
    });

    // Vector results
    mockQuery.mockResolvedValueOnce([
      {
        id: "chunk-1",
        datasetId: "ds-1",
        content: "Vector match content",
        sourcePage: 1,
        sourceSection: "Intro",
        orderIndex: 0,
        distance: 0.2,
        datasetName: "Test Dataset",
      },
    ]);

    // Keyword results
    mockQuery.mockResolvedValueOnce([
      {
        id: "chunk-2",
        datasetId: "ds-1",
        content: "Keyword match content with test query",
        sourcePage: 2,
        sourceSection: "Body",
        orderIndex: 1,
        distance: 0.5,
        datasetName: "Test Dataset",
      },
    ]);

    const ctx = createTestContext({
      params: {
        query: "test query",
        datasetId: "44444444-4444-4444-8444-444444444444",
        topK: 5,
      },
      callStubs: {
        "dataset.getDataset": { id: "44444444-4444-4444-8444-444444444444" },
      },
    });

    const result: any = await semanticSearchAction.handler(ctx);

    expect(result.count).toBe(2);
    expect(result.query).toBe("test query");
    expect(result.results).toHaveLength(2);

    // Keyword match should have keywordMatch = true
    const keywordResult = result.results.find(
      (r: any) => r.chunkId === "chunk-2",
    );
    expect(keywordResult?.keywordMatch).toBe(true);

    // Vector-only match should have keywordMatch = false
    const vectorResult = result.results.find(
      (r: any) => r.chunkId === "chunk-1",
    );
    expect(vectorResult?.keywordMatch).toBe(false);
  });

  it("should boost results that appear in both vector and keyword search", async () => {
    const mockEmbedding = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
    mockAI.generateEmbeddings.mockResolvedValueOnce({
      ...aiDefaults.embeddingsResult,
      embeddings: [mockEmbedding],
    });

    const sharedChunk = {
      id: "chunk-shared",
      datasetId: "ds-1",
      content: "Shared content",
      sourcePage: 1,
      sourceSection: null,
      orderIndex: 0,
      distance: 0.3,
      datasetName: "Test",
    };

    // Both queries return the same chunk
    mockQuery.mockResolvedValueOnce([sharedChunk]);
    mockQuery.mockResolvedValueOnce([sharedChunk]);

    const ctx = createTestContext({
      params: {
        query: "shared content",
        sessionId: "11111111-1111-4111-8111-111111111111",
        topK: 5,
      },
      callStubs: {
        "session.getSession": { id: "11111111-1111-4111-8111-111111111111" },
      },
    });

    const result: any = await semanticSearchAction.handler(ctx);

    expect(result.count).toBe(1);
    const item = result.results[0];
    // Should be marked as keyword match since it appeared in both
    expect(item.keywordMatch).toBe(true);
    // Similarity should be boosted (vector * 0.7 + 0.3 keyword weight)
    expect(item.similarity).toBeGreaterThan(0.3);
  });
});
