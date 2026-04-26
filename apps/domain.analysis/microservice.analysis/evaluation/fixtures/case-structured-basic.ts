/**
 * Fixture: Structured Basic
 *
 * The agent answers a simple aggregation query (total revenue by country)
 * on a structured-table dataset using a single aggregate tool call.
 */

import type { ChatWithToolsResponse } from "core.lib/adapters/ai";
import type { EvalCase } from "../types";

const DATASET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const BASE_RESPONSE: Omit<ChatWithToolsResponse, "content" | "toolCalls"> = {
  completionTokens: 20,
  durationMs: 100,
  model: "mock-model",
  promptTokens: 100,
  reasoning: null,
  totalTokens: 120,
};

export const caseStructuredBasic: EvalCase = {
  aiResponses: [
    {
      ...BASE_RESPONSE,
      content: "",
      toolCalls: [
        {
          function: {
            arguments: {
              aggregations: [{ field: "revenue", operation: "sum" }],
              datasetId: DATASET_ID,
              groupBy: ["country"],
            },
            name: "aggregate",
          },
        },
      ],
    },
    {
      ...BASE_RESPONSE,
      completionTokens: 50,
      content:
        "The total revenue by country is as follows: USA: $500,000, Germany: $200,000, France: $150,000. Confidence: 0.9",
      toolCalls: [],
      totalTokens: 150,
    },
  ],
  callStubs: {
    "dataset.getDataset": {
      datasetType: "structured-table",
      id: DATASET_ID,
      name: "Sales Data",
    },
    "tools.aggregate": {
      results: [
        { country: "France", total: 150000 },
        { country: "Germany", total: 200000 },
        { country: "USA", total: 500000 },
      ],
      totalGroups: 3,
      truncated: false,
    },
  },
  datasets: [
    { datasetType: "structured-table", id: DATASET_ID, name: "Sales Data" },
  ],
  description: "Basic structured data aggregation — revenue by country",
  expectedToolCalls: [{ minCalls: 1, toolName: "aggregate" }],
  id: "structured-basic",
  maxIterations: 5,
  minConfidence: 0.8,
  referenceAnswer: "USA: $500,000, Germany: $200,000, France: $150,000",
  userMessage: "What is the total revenue by country?",
};
