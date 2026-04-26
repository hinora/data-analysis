/**
 * Fixture: Multi-Iteration
 *
 * The agent compares Q1 and Q2 revenue trends and identifies outliers,
 * requiring two separate aggregate tool calls — one per quarter — before
 * synthesising the final answer.
 *
 * Flow: aggregate(Q1) → self-reflect → aggregate(Q2) → self-reflect → final answer
 * Expected main-loop iterations: 3 (tool call 1, tool call 2, final answer)
 */

import type { ChatWithToolsResponse } from "core.lib/adapters/ai";
import type { EvalCase } from "../types";

const DATASET_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const BASE_RESPONSE: Omit<ChatWithToolsResponse, "content" | "toolCalls"> = {
  completionTokens: 20,
  durationMs: 100,
  model: "mock-model",
  promptTokens: 100,
  reasoning: null,
  totalTokens: 120,
};

export const caseMultiIteration: EvalCase = {
  aiResponses: [
    // Iteration 1: fetch Q1 data
    {
      ...BASE_RESPONSE,
      content: "",
      toolCalls: [
        {
          function: {
            arguments: {
              aggregations: [{ field: "revenue", operation: "sum" }],
              conditions: [{ field: "quarter", operator: "eq", value: "Q1" }],
              datasetId: DATASET_ID,
              groupBy: ["quarter"],
            },
            name: "aggregate",
          },
        },
      ],
    },
    // Iteration 2 (after self-reflection): fetch Q2 data
    {
      ...BASE_RESPONSE,
      content: "",
      toolCalls: [
        {
          function: {
            arguments: {
              aggregations: [{ field: "revenue", operation: "sum" }],
              conditions: [{ field: "quarter", operator: "eq", value: "Q2" }],
              datasetId: DATASET_ID,
              groupBy: ["quarter"],
            },
            name: "aggregate",
          },
        },
      ],
    },
    // Iteration 3 (after second self-reflection): final answer
    {
      ...BASE_RESPONSE,
      completionTokens: 70,
      content:
        "Q1 revenue totaled $1.2M while Q2 showed $1.5M — 25% growth. Outlier detected: Widget X at $500K. Confidence: 0.88",
      toolCalls: [],
      totalTokens: 170,
    },
  ],
  callStubs: {
    "dataset.getDataset": {
      datasetType: "structured-table",
      id: DATASET_ID,
      name: "Revenue Trends",
    },
    "tools.aggregate": {
      results: [{ quarter: "Q1", revenue: 1200000 }],
      totalGroups: 1,
      truncated: false,
    },
  },
  datasets: [
    {
      datasetType: "structured-table",
      id: DATASET_ID,
      name: "Revenue Trends",
    },
  ],
  description: "Multi-iteration — compare Q1 vs Q2 revenue and find outliers",
  expectedToolCalls: [{ minCalls: 2, toolName: "aggregate" }],
  id: "multi-iteration",
  maxIterations: 7,
  referenceAnswer: "Q1: $1.2M, Q2: $1.5M, 25% growth, outlier: Widget X",
  userMessage:
    "Compare revenue trends between Q1 and Q2, then identify top outliers",
};
