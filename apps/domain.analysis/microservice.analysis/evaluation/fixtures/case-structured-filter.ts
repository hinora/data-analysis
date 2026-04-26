/**
 * Fixture: Structured Filter
 *
 * The agent answers a filtered aggregation query (top 5 products by revenue
 * in Germany). With a real AI the agent should use the `aggregate` tool with
 * appropriate conditions and ordering parameters.
 */

import type { EvalCase } from "../types";

const DATASET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const caseStructuredFilter: EvalCase = {
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
