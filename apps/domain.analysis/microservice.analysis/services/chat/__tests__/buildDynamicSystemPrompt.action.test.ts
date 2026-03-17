/**
 * Tests for chat/buildDynamicSystemPrompt.action.ts
 */

import { createTestContext } from "core.lib/testing";

import buildDynamicSystemPromptAction from "../buildDynamicSystemPrompt.action";

describe("chat.buildDynamicSystemPrompt action", () => {
  it("should build system prompt with structured datasets", async () => {
    const ctx = createTestContext({
      params: { sessionId: "11111111-1111-4111-8111-111111111111" },
      callStubs: {
        "dataset.listDatasets": [
          {
            id: "ds-1",
            name: "Sales Data",
            datasetType: "structured-table",
            fileType: "csv",
            rowCount: 100,
            columnMappings: [
              {
                camelCase: "revenue",
                original: "Revenue",
                detectedType: "number",
                description: "Total revenue",
              },
              {
                camelCase: "region",
                original: "Region",
                detectedType: "string",
              },
            ],
            structuredMetadata: {
              datasetDescription: "Quarterly sales figures",
            },
          },
        ],
      },
    });

    const result = await buildDynamicSystemPromptAction.handler(ctx);

    expect(result.systemPrompt).toBeDefined();
    expect(result.systemPrompt).toContain("AI data analysis assistant");
    expect(result.systemPrompt).toContain("Sales Data");
    expect(result.systemPrompt).toContain("ds-1");
    expect(result.systemPrompt).toContain("structured-table");
    expect(result.systemPrompt).toContain("revenue");
    expect(result.systemPrompt).toContain("Quarterly sales figures");
  });

  it("should build system prompt with unstructured datasets", async () => {
    const ctx = createTestContext({
      params: { sessionId: "11111111-1111-4111-8111-111111111111" },
      callStubs: {
        "dataset.listDatasets": [
          {
            id: "ds-2",
            name: "Research Paper",
            datasetType: "unstructured-text",
            fileType: "pdf",
            rowCount: 50,
            unstructuredMetadata: {
              documentSummary: "A paper about AI",
              chunkCount: 25,
              keyTopics: ["machine learning", "neural networks"],
              entities: [
                { name: "GPT", type: "model", count: 10 },
                { name: "BERT", type: "model", count: 5 },
              ],
              documentIndex: [
                {
                  title: "Introduction",
                  indexLabel: "1",
                  level: 0,
                  summary: "Overview",
                  chunkStart: 0,
                  chunkEnd: 5,
                  chunkIds: [],
                },
              ],
            },
          },
        ],
      },
    });

    const result = await buildDynamicSystemPromptAction.handler(ctx);

    expect(result.systemPrompt).toContain("Research Paper");
    expect(result.systemPrompt).toContain("unstructured-text");
    expect(result.systemPrompt).toContain("A paper about AI");
    expect(result.systemPrompt).toContain("machine learning");
    expect(result.systemPrompt).toContain("GPT");
    expect(result.systemPrompt).toContain("Introduction");
  });

  it("should handle empty datasets", async () => {
    const ctx = createTestContext({
      params: { sessionId: "11111111-1111-4111-8111-111111111111" },
      callStubs: {
        "dataset.listDatasets": [],
      },
    });

    const result = await buildDynamicSystemPromptAction.handler(ctx);

    expect(result.systemPrompt).toContain("No datasets have been imported");
  });

  it("should include tool categories in the prompt", async () => {
    const ctx = createTestContext({
      params: { sessionId: "11111111-1111-4111-8111-111111111111" },
      callStubs: {
        "dataset.listDatasets": [],
      },
    });

    const result = await buildDynamicSystemPromptAction.handler(ctx);

    expect(result.systemPrompt).toContain("Structured Data Tools");
    expect(result.systemPrompt).toContain("Unstructured Text Tools");
    expect(result.systemPrompt).toContain("Data Matching Rules");
    expect(result.systemPrompt).toContain("Result Size Management");
    expect(result.systemPrompt).toContain("Self-Reflection");
  });

  it("should include both structured and unstructured datasets", async () => {
    const ctx = createTestContext({
      params: { sessionId: "11111111-1111-4111-8111-111111111111" },
      callStubs: {
        "dataset.listDatasets": [
          {
            id: "ds-1",
            name: "CSV Data",
            datasetType: "structured-table",
            fileType: "csv",
            rowCount: 50,
          },
          {
            id: "ds-2",
            name: "PDF Doc",
            datasetType: "unstructured-text",
            fileType: "pdf",
            rowCount: 10,
          },
        ],
      },
    });

    const result = await buildDynamicSystemPromptAction.handler(ctx);

    expect(result.systemPrompt).toContain("CSV Data");
    expect(result.systemPrompt).toContain("PDF Doc");
    expect(result.systemPrompt).toContain("Structured Table Datasets");
    expect(result.systemPrompt).toContain("Unstructured Text Datasets");
  });
});
