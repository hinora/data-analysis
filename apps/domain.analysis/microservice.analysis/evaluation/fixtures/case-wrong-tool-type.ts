/**
 * Fixture: Wrong Tool Type
 *
 * The dataset is `unstructured-text`. A real AI should recognise this
 * from the system prompt and select `semanticSearch` (the correct
 * unstructured tool) rather than `aggregate`. This fixture tests whether
 * the AI avoids the tool-category mismatch or successfully self-corrects
 * if it initially picks the wrong tool.
 */

import type { EvalCase } from "../types";

const DATASET_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

export const caseWrongToolType: EvalCase = {
  callStubs: {
    "dataset.getDataset": {
      datasetType: "unstructured-text",
      id: DATASET_ID,
      name: "Legal Document",
    },
    "tools.semanticSearch": {
      chunks: [
        {
          content:
            "The party assumes all liability for damages arising from this agreement.",
          score: 0.91,
        },
        {
          content:
            "Indemnification clause: each party shall indemnify the other against third-party claims.",
          score: 0.87,
        },
        {
          content:
            "Termination clause: either party may terminate with 30 days written notice.",
          score: 0.83,
        },
      ],
      total: 3,
    },
  },
  datasets: [
    {
      datasetType: "unstructured-text",
      id: DATASET_ID,
      name: "Legal Document",
    },
  ],
  description:
    "Wrong-tool self-correction — agent recovers from using aggregate on unstructured dataset",
  expectedToolCalls: [{ minCalls: 1, toolName: "semanticSearch" }],
  id: "wrong-tool-type",
  maxIterations: 7,
  referenceAnswer:
    "liability, indemnification, termination clause, jurisdiction",
  userMessage: "Summarize the key terms in this document",
};
