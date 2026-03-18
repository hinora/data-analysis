/**
 * Tests for lib/map-reduce.ts
 *
 * Covers pure utility functions and AI-dependent functions (via mock adapter).
 */

import { createMockAIAdapter } from "core.lib/testing";
import {
  assignIndexLabels,
  extractMetadataBatch,
  type MapReduceLogger,
  mergePartialMetadata,
  type PartialUnstructuredMetadata,
  reduceTextSummaries,
  runWithConcurrency,
  splitIntoBatchesByChars,
  summarizeTextBatch,
} from "../map-reduce";

// ---------------------------------------------------------------------------
// Helper: silent logger for AI-dependent tests
// ---------------------------------------------------------------------------
const silentLogger: MapReduceLogger = {
  info: jest.fn(),
};

// ═══════════════════════════════════════════════════════════════════════════
// splitIntoBatchesByChars
// ═══════════════════════════════════════════════════════════════════════════
describe("splitIntoBatchesByChars", () => {
  it("should return empty array for empty input", () => {
    const result = splitIntoBatchesByChars({
      getLength: (s: string) => s.length,
      items: [],
      maxChars: 100,
    });
    expect(result).toEqual([]);
  });

  it("should keep all items in one batch when under limit", () => {
    const items = ["abc", "def"];
    const result = splitIntoBatchesByChars({
      getLength: (s) => s.length,
      items,
      maxChars: 100,
    });
    expect(result).toEqual([["abc", "def"]]);
  });

  it("should split into multiple batches when exceeding limit", () => {
    const items = ["aaaa", "bbbb", "cccc"];
    const result = splitIntoBatchesByChars({
      getLength: (s) => s.length,
      items,
      maxChars: 8,
    });
    expect(result).toEqual([["aaaa", "bbbb"], ["cccc"]]);
  });

  it("should handle single item exceeding limit", () => {
    const items = ["very-long-item"];
    const result = splitIntoBatchesByChars({
      getLength: (s) => s.length,
      items,
      maxChars: 5,
    });
    expect(result).toEqual([["very-long-item"]]);
  });

  it("should create one batch per item when each exceeds limit", () => {
    const items = ["aaa", "bbb", "ccc"];
    const result = splitIntoBatchesByChars({
      getLength: (s) => s.length,
      items,
      maxChars: 3,
    });
    expect(result).toEqual([["aaa"], ["bbb"], ["ccc"]]);
  });

  it("should work with custom getLength function", () => {
    const items = [{ text: "hi" }, { text: "world" }, { text: "!" }];
    const result = splitIntoBatchesByChars({
      getLength: (item) => item.text.length,
      items,
      maxChars: 6,
    });
    expect(result).toEqual([
      [{ text: "hi" }],
      [{ text: "world" }, { text: "!" }],
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// runWithConcurrency
// ═══════════════════════════════════════════════════════════════════════════
describe("runWithConcurrency", () => {
  it("should return empty array for no tasks", async () => {
    const result = await runWithConcurrency({ concurrency: 3, tasks: [] });
    expect(result).toEqual([]);
  });

  it("should run all tasks and return results in order", async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];
    const result = await runWithConcurrency({ concurrency: 2, tasks });
    expect(result).toEqual([1, 2, 3]);
  });

  it("should run all in parallel when concurrency >= tasks.length", async () => {
    const order: number[] = [];
    const tasks = [
      async () => {
        order.push(1);
        return "a";
      },
      async () => {
        order.push(2);
        return "b";
      },
    ];
    const result = await runWithConcurrency({ concurrency: 5, tasks });
    expect(result).toEqual(["a", "b"]);
    expect(order).toEqual([1, 2]);
  });

  it("should respect concurrency limit of 1 (sequential)", async () => {
    const order: number[] = [];
    const tasks = [
      async () => {
        order.push(1);
        return "a";
      },
      async () => {
        order.push(2);
        return "b";
      },
      async () => {
        order.push(3);
        return "c";
      },
    ];
    const result = await runWithConcurrency({ concurrency: 1, tasks });
    expect(result).toEqual(["a", "b", "c"]);
    expect(order).toEqual([1, 2, 3]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// mergePartialMetadata
// ═══════════════════════════════════════════════════════════════════════════
describe("mergePartialMetadata", () => {
  const partial1: PartialUnstructuredMetadata = {
    contentDomain: "financial",
    documentSummary: "Summary of part 1",
    entities: [
      { name: "Acme Corp", type: "organisation", count: 2 },
      { name: "New York", type: "location", count: 1 },
    ],
    keyTopics: ["Revenue", "Growth"],
    sections: [
      {
        chunkEnd: 5,
        chunkStart: 0,
        level: 0,
        summary: "Section 1",
        title: "Introduction",
      },
    ],
  };

  const partial2: PartialUnstructuredMetadata = {
    contentDomain: "financial",
    documentSummary: "Summary of part 2",
    entities: [
      { name: "Acme Corp", type: "organisation", count: 3 },
      { name: "London", type: "location", count: 1 },
    ],
    keyTopics: ["revenue", "Expenses"],
    sections: [
      {
        chunkEnd: 10,
        chunkStart: 6,
        level: 0,
        summary: "Section 2",
        title: "Analysis",
      },
    ],
  };

  it("should merge summaries with newlines", () => {
    const result = mergePartialMetadata([partial1, partial2]);
    expect(result.documentSummary).toBe(
      "Summary of part 1\n\nSummary of part 2",
    );
  });

  it("should deduplicate topics case-insensitively", () => {
    const result = mergePartialMetadata([partial1, partial2]);
    expect(result.keyTopics).toEqual(["Expenses", "Growth", "Revenue"]);
  });

  it("should merge entities by name+type and sum counts", () => {
    const result = mergePartialMetadata([partial1, partial2]);
    const acme = result.entities.find((e) => e.name === "Acme Corp");
    expect(acme?.count).toBe(5);
    expect(result.entities).toHaveLength(3);
  });

  it("should pick most common content domain", () => {
    const result = mergePartialMetadata([partial1, partial2]);
    expect(result.contentDomain).toBe("financial");
  });

  it("should pick different domain when more frequent", () => {
    const partial3: PartialUnstructuredMetadata = {
      ...partial2,
      contentDomain: "legal",
    };
    const partial4: PartialUnstructuredMetadata = {
      ...partial2,
      contentDomain: "legal",
    };
    const result = mergePartialMetadata([partial1, partial3, partial4]);
    expect(result.contentDomain).toBe("legal");
  });

  it("should concatenate sections in order", () => {
    const result = mergePartialMetadata([partial1, partial2]);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe("Introduction");
    expect(result.sections[1].title).toBe("Analysis");
  });

  it("should handle single partial", () => {
    const result = mergePartialMetadata([partial1]);
    expect(result.documentSummary).toBe("Summary of part 1");
    expect(result.keyTopics).toEqual(["Growth", "Revenue"]);
    expect(result.entities).toHaveLength(2);
  });

  it("should handle empty partials array", () => {
    const result = mergePartialMetadata([]);
    expect(result.documentSummary).toBe("");
    expect(result.keyTopics).toEqual([]);
    expect(result.entities).toEqual([]);
    expect(result.contentDomain).toBe("unknown");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// assignIndexLabels
// ═══════════════════════════════════════════════════════════════════════════
describe("assignIndexLabels", () => {
  it("should assign numeric labels for level-0 sections", () => {
    const sections = [{ level: 0 }, { level: 0 }, { level: 0 }];
    expect(assignIndexLabels(sections)).toEqual(["1", "2", "3"]);
  });

  it("should assign alpha labels for level-1 sub-sections", () => {
    const sections = [{ level: 0 }, { level: 1 }, { level: 1 }, { level: 0 }];
    expect(assignIndexLabels(sections)).toEqual(["1", "1a", "1b", "2"]);
  });

  it("should assign roman numerals for level-2 sub-sections", () => {
    const sections = [{ level: 0 }, { level: 1 }, { level: 2 }, { level: 2 }];
    expect(assignIndexLabels(sections)).toEqual(["1", "1a", "1a-i", "1a-ii"]);
  });

  it("should use numeric suffix for level 3+", () => {
    const sections = [{ level: 0 }, { level: 1 }, { level: 2 }, { level: 3 }];
    expect(assignIndexLabels(sections)).toEqual(["1", "1a", "1a-i", "1a-i-1"]);
  });

  it("should reset sub-section counters when new parent appears", () => {
    const sections = [
      { level: 0 },
      { level: 1 },
      { level: 1 },
      { level: 0 },
      { level: 1 },
    ];
    expect(assignIndexLabels(sections)).toEqual(["1", "1a", "1b", "2", "2a"]);
  });

  it("should handle empty sections array", () => {
    expect(assignIndexLabels([])).toEqual([]);
  });

  it("should handle single section", () => {
    expect(assignIndexLabels([{ level: 0 }])).toEqual(["1"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// summarizeTextBatch (AI-dependent)
// ═══════════════════════════════════════════════════════════════════════════
describe("summarizeTextBatch", () => {
  it("should call AI generateText and return content", async () => {
    const ai = createMockAIAdapter();
    ai.generateText.mockResolvedValueOnce({
      content: "This is a summary",
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
      durationMs: 100,
      model: "mock",
    });

    const result = await summarizeTextBatch({
      ai,
      batchIndex: 0,
      logger: silentLogger,
      text: "Some document text to summarize",
      totalBatches: 1,
    });

    expect(result).toBe("This is a summary");
    expect(ai.generateText).toHaveBeenCalledTimes(1);
    expect(ai.generateText.mock.calls[0][0].prompt).toContain(
      "Some document text to summarize",
    );
  });

  it("should include batch context when multiple batches", async () => {
    const ai = createMockAIAdapter();
    ai.generateText.mockResolvedValueOnce({
      content: "Part 2 summary",
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
      durationMs: 100,
      model: "mock",
    });

    await summarizeTextBatch({
      ai,
      batchIndex: 1,
      logger: silentLogger,
      text: "Second batch text",
      totalBatches: 3,
    });

    const prompt = ai.generateText.mock.calls[0][0].prompt;
    expect(prompt).toContain("Part 2 of 3");
  });

  it("should truncate text to maxChars", async () => {
    const ai = createMockAIAdapter();
    ai.generateText.mockResolvedValueOnce({
      content: "Truncated summary",
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
      durationMs: 100,
      model: "mock",
    });

    const longText = "x".repeat(200);
    await summarizeTextBatch({
      ai,
      batchIndex: 0,
      logger: silentLogger,
      maxChars: 50,
      text: longText,
      totalBatches: 1,
    });

    const prompt = ai.generateText.mock.calls[0][0].prompt;
    // The prompt should contain only 50 chars of the text, not 200
    expect(prompt).not.toContain("x".repeat(200));
    expect(prompt).toContain("x".repeat(50));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// reduceTextSummaries (AI-dependent)
// ═══════════════════════════════════════════════════════════════════════════
describe("reduceTextSummaries", () => {
  it("should return single summary as-is", async () => {
    const ai = createMockAIAdapter();
    const result = await reduceTextSummaries({
      ai,
      concurrency: 1,
      logger: silentLogger,
      summaries: ["Only summary"],
    });
    expect(result).toBe("Only summary");
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it("should combine multiple short summaries via AI", async () => {
    const ai = createMockAIAdapter();
    ai.generateText.mockResolvedValueOnce({
      content: "Combined summary",
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
      durationMs: 100,
      model: "mock",
    });

    const result = await reduceTextSummaries({
      ai,
      concurrency: 1,
      logger: silentLogger,
      summaries: ["Summary A", "Summary B"],
    });

    expect(result).toBe("Combined summary");
    expect(ai.generateText).toHaveBeenCalledTimes(1);
    const prompt = ai.generateText.mock.calls[0][0].prompt;
    expect(prompt).toContain("Part 1");
    expect(prompt).toContain("Part 2");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// extractMetadataBatch (AI-dependent)
// ═══════════════════════════════════════════════════════════════════════════
describe("extractMetadataBatch", () => {
  it("should extract metadata from AI JSON response", async () => {
    const ai = createMockAIAdapter();
    ai.generateJSON.mockResolvedValueOnce({
      data: {
        documentSummary: "A financial report",
        keyTopics: ["revenue", "growth"],
        contentDomain: "financial",
        entities: [{ name: "Acme", type: "organisation", count: 3 }],
        sections: [
          {
            title: "Overview",
            summary: "Overview of report",
            chunkStart: 0,
            chunkEnd: 5,
            level: 0,
          },
        ],
      },
      rawResponse: "{}",
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
      durationMs: 100,
      model: "mock",
    });

    const result = await extractMetadataBatch({
      ai,
      batchIndex: 0,
      chunkEndIndex: 5,
      chunkStartIndex: 0,
      logger: silentLogger,
      text: "Some financial text",
      totalBatches: 1,
    });

    expect(result.documentSummary).toBe("A financial report");
    expect(result.keyTopics).toEqual(["revenue", "growth"]);
    expect(result.contentDomain).toBe("financial");
    expect(result.entities).toHaveLength(1);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe("Overview");
  });

  it("should handle empty/invalid AI response gracefully", async () => {
    const ai = createMockAIAdapter();
    ai.generateJSON.mockResolvedValueOnce({
      data: null,
      rawResponse: "null",
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
      durationMs: 100,
      model: "mock",
    });

    const result = await extractMetadataBatch({
      ai,
      batchIndex: 2,
      chunkEndIndex: 10,
      chunkStartIndex: 5,
      logger: silentLogger,
      text: "Some text",
      totalBatches: 3,
    });

    expect(result.documentSummary).toBe("");
    expect(result.keyTopics).toEqual([]);
    expect(result.entities).toEqual([]);
    expect(result.contentDomain).toBe("unknown");
    // Should create a fallback section
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe("Part 3");
    expect(result.sections[0].chunkStart).toBe(5);
    expect(result.sections[0].chunkEnd).toBe(10);
  });

  it("should clamp section chunkStart/chunkEnd to valid range", async () => {
    const ai = createMockAIAdapter();
    ai.generateJSON.mockResolvedValueOnce({
      data: {
        documentSummary: "Summary",
        keyTopics: [],
        contentDomain: "general",
        entities: [],
        sections: [
          {
            title: "Out of range",
            summary: "test",
            chunkStart: -5,
            chunkEnd: 999,
            level: 0,
          },
        ],
      },
      rawResponse: "{}",
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
      durationMs: 100,
      model: "mock",
    });

    const result = await extractMetadataBatch({
      ai,
      batchIndex: 0,
      chunkEndIndex: 10,
      chunkStartIndex: 0,
      logger: silentLogger,
      text: "Some text",
      totalBatches: 1,
    });

    expect(result.sections[0].chunkStart).toBe(0);
    expect(result.sections[0].chunkEnd).toBe(10);
  });
});
