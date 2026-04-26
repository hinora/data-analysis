/**
 * Fixture: Unstructured RAG
 *
 * The agent answers a question about key findings in a research report
 * using a semanticSearch tool call on an unstructured-text dataset.
 */

import type { ChatWithToolsResponse } from "core.lib/adapters/ai";
import type { EvalCase } from "../types";

const DATASET_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const BASE_RESPONSE: Omit<ChatWithToolsResponse, "content" | "toolCalls"> = {
  completionTokens: 20,
  durationMs: 100,
  model: "mock-model",
  promptTokens: 100,
  reasoning: null,
  totalTokens: 120,
};

export const caseUnstructuredRag: EvalCase = {
  aiResponses: [
    {
      ...BASE_RESPONSE,
      content: "",
      toolCalls: [
        {
          function: {
            arguments: {
              datasetId: DATASET_ID,
              query: "key findings",
            },
            name: "semanticSearch",
          },
        },
      ],
    },
    {
      ...BASE_RESPONSE,
      completionTokens: 60,
      content:
        "The key findings in the report are: 1) Market growth is expected to reach 15% by 2025. 2) Consumer preferences have shifted towards digital channels. 3) Supply chain disruptions remain a key risk. Confidence: 0.8",
      toolCalls: [],
      totalTokens: 160,
    },
  ],
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
