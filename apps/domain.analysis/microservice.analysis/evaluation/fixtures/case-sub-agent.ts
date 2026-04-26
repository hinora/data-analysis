/**
 * Fixture: Sub-Agent Delegation
 *
 * The main agent is prompted to perform a detailed sales analysis.
 * With a real AI the agent should delegate to a sub-agent via
 * `createSubAgent`, which independently calls `aggregate` and returns
 * regional findings that the main agent synthesises.
 */

import type { EvalCase } from "../types";

const DATASET_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

export const caseSubAgent: EvalCase = {
  callStubs: {
    "dataset.getDataset": {
      datasetType: "structured-table",
      id: DATASET_ID,
      name: "Sales Performance",
    },
    "tools.aggregate": {
      results: [
        { region: "North America", revenue: 2100000 },
        { region: "Europe", revenue: 1400000 },
        { region: "Asia Pacific", revenue: 900000 },
      ],
      totalGroups: 3,
      truncated: false,
    },
  },
  datasets: [
    {
      datasetType: "structured-table",
      id: DATASET_ID,
      name: "Sales Performance",
    },
  ],
  description: "Sub-agent delegation — sales performance analysis by region",
  expectedToolCalls: [{ minCalls: 1, toolName: "createSubAgent" }],
  id: "sub-agent",
  maxIterations: 10,
  referenceAnswer: "North America is the top performing region with $2.1M",
  userMessage:
    "Perform a detailed analysis of sales performance and identify the top performing region",
};
