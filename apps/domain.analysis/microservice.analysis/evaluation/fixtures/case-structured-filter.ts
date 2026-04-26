/**
 * Fixture: Structured Filter
 *
 * The agent answers a filtered aggregation query (top 5 products by revenue
 * in Germany) using the aggregate tool with a conditions filter.
 */

import type { ChatWithToolsResponse } from "core.lib/adapters/ai";
import type { EvalCase } from "../types";

const DATASET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const BASE_RESPONSE: Omit<ChatWithToolsResponse, "content" | "toolCalls"> = {
  completionTokens: 20,
  durationMs: 100,
  model: "mock-model",
  promptTokens: 100,
  reasoning: null,
  totalTokens: 120,
};

export const caseStructuredFilter: EvalCase = {
  aiResponses: [
    {
      ...BASE_RESPONSE,
      content: "",
      toolCalls: [
        {
          function: {
            arguments: {
              aggregations: [{ field: "revenue", operation: "sum" }],
              conditions: [
                { field: "country", operator: "eq", value: "Germany" },
              ],
              datasetId: DATASET_ID,
              groupBy: ["product"],
              limit: 5,
              orderBy: { direction: "desc", field: "revenue" },
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
        "The top 5 products by revenue in Germany are: Widget A: $50,000, Widget B: $45,000, Widget C: $40,000, Widget D: $35,000, Widget E: $30,000. Confidence: 0.85",
      toolCalls: [],
      totalTokens: 150,
    },
  ],
  callStubs: {
    "dataset.getDataset": {
      datasetType: "structured-table",
      id: DATASET_ID,
      name: "Product Sales",
    },
    "tools.aggregate": {
      results: [
        { product: "Widget A", revenue: 50000 },
        { product: "Widget B", revenue: 45000 },
        { product: "Widget C", revenue: 40000 },
        { product: "Widget D", revenue: 35000 },
        { product: "Widget E", revenue: 30000 },
      ],
      totalGroups: 5,
      truncated: false,
    },
  },
  datasets: [
    {
      datasetType: "structured-table",
      id: DATASET_ID,
      name: "Product Sales",
    },
  ],
  description: "Filtered aggregation — top 5 products by revenue in Germany",
  expectedToolCalls: [{ minCalls: 1, toolName: "aggregate" }],
  id: "structured-filter",
  maxIterations: 5,
  referenceAnswer:
    "Widget A: $50,000, Widget B: $45,000, Widget C: $40,000, Widget D: $35,000, Widget E: $30,000",
  userMessage: "Show me the top 5 products by revenue in Germany",
};
