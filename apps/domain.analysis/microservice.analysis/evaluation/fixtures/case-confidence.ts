/**
 * Fixture: Confidence Calibration
 *
 * The agent answers a question about customer tier distribution and explicitly
 * reports a confidence score of 0.85 in its response. The minConfidence
 * threshold is set to 0.8 to verify the confidence-calibration metric.
 */

import type { ChatWithToolsResponse } from "core.lib/adapters/ai";
import type { EvalCase } from "../types";

const DATASET_ID = "a1111111-1111-4111-8111-111111111111";

const BASE_RESPONSE: Omit<ChatWithToolsResponse, "content" | "toolCalls"> = {
  completionTokens: 20,
  durationMs: 100,
  model: "mock-model",
  promptTokens: 100,
  reasoning: null,
  totalTokens: 120,
};

export const caseConfidence: EvalCase = {
  aiResponses: [
    // [0] Count distinct customer tiers via aggregate
    {
      ...BASE_RESPONSE,
      content: "",
      toolCalls: [
        {
          function: {
            arguments: {
              aggregations: [{ field: "customerId", operation: "count" }],
              datasetId: DATASET_ID,
              groupBy: ["tier"],
            },
            name: "aggregate",
          },
        },
      ],
    },
    // [1] Final answer with explicit confidence score
    {
      ...BASE_RESPONSE,
      completionTokens: 45,
      content:
        "Based on the data, 28% of customers are in the premium tier (2,800 out of 10,000 total customers). Confidence: 0.85",
      toolCalls: [],
      totalTokens: 145,
    },
  ],
  callStubs: {
    "dataset.getDataset": {
      datasetType: "structured-table",
      id: DATASET_ID,
      name: "Customer Data",
    },
    "tools.aggregate": {
      results: [
        { count: 2800, tier: "premium" },
        { count: 4200, tier: "standard" },
        { count: 3000, tier: "basic" },
      ],
      totalGroups: 3,
      truncated: false,
    },
  },
  datasets: [
    {
      datasetType: "structured-table",
      id: DATASET_ID,
      name: "Customer Data",
    },
  ],
  description:
    "Confidence calibration — premium tier percentage with explicit confidence",
  expectedToolCalls: [{ minCalls: 1, toolName: "aggregate" }],
  id: "confidence",
  maxIterations: 5,
  minConfidence: 0.8,
  referenceAnswer: "28% of customers are in the premium tier",
  userMessage: "What percentage of customers are in the premium tier?",
};
