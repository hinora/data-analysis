/**
 * Fixture: Unstructured RAG
 *
 * The agent answers a question about key findings in a research report.
 * With a real AI the agent should select `semanticSearch` (the correct
 * tool for unstructured-text datasets) rather than a structured tool.
 */

import type { EvalCase } from "../types";

const DATASET_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export const caseUnstructuredRag: EvalCase = {
  callStubs: {
    "dataset.getDataset": {
      datasetType: "unstructured-text",
      id: DATASET_ID,
      name: "Research Report",
    },
    "tools.semanticSearch": {
      chunks: [
        {
          content:
            "Market growth is expected to reach 15% by 2025 according to industry analysts.",
          score: 0.92,
        },
        {
          content:
            "Consumer preferences have shifted significantly towards digital channels in recent years.",
          score: 0.88,
        },
        {
          content:
            "Supply chain disruptions remain a key risk factor for the industry.",
          score: 0.85,
        },
      ],
      total: 3,
    },
  },
  datasets: [
    {
      datasetType: "unstructured-text",
      id: DATASET_ID,
      name: "Research Report",
    },
  ],
  description: "Unstructured RAG — key findings from a research report",
  expectedToolCalls: [{ minCalls: 1, toolName: "semanticSearch" }],
  id: "unstructured-rag",
  maxIterations: 5,
  referenceAnswer:
    "Market growth 15% by 2025, digital channels shift, supply chain disruptions",
  userMessage: "What are the key findings in the report?",
};
