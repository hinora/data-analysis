/**
 * Fixture: Multi-Iteration
 *
 * The agent compares Q1 and Q2 revenue trends and identifies outliers.
 * With a real AI the agent should make at least two separate `aggregate`
 * calls (one per quarter) and synthesise findings before answering.
 *
 * The `tools.aggregate` stub always returns Q1 data; the agent is expected
 * to interpret the results and produce a meaningful comparative answer.
 */

import type { EvalCase } from "../types";

const DATASET_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

export const caseMultiIteration: EvalCase = {
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
