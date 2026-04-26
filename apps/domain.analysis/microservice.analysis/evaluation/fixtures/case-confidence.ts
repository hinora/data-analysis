/**
 * Fixture: Confidence Calibration
 *
 * The agent answers a question about customer tier distribution. With a
 * real AI the agent should call `aggregate`, interpret the results, and
 * include a confidence score in the answer that the confidence-calibration
 * metric can validate (minConfidence: 0.8).
 */

import type { EvalCase } from "../types";

const DATASET_ID = "77777777-7777-4777-8777-777777777777";

export const caseConfidence: EvalCase = {
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
