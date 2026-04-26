/**
 * Fixture: Structured Basic
 *
 * The agent answers a simple aggregation query (total revenue by country)
 * on a structured-table dataset. With a real AI the agent should choose
 * the `aggregate` tool, group by country, and produce a coherent summary.
 */

import type { EvalCase } from "../types";

const DATASET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const caseStructuredBasic: EvalCase = {
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
