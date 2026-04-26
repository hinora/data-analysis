/**
 * Fixture: Wrong Tool Type
 *
 * The agent initially calls `aggregate` (a structured-data tool) on an
 * unstructured-text dataset. The framework rejects this call with a type
 * mismatch error. The agent self-corrects and calls `semanticSearch`
 * (the appropriate unstructured-text tool) on the second iteration.
 *
 * AI call sequence:
 *   [0] AI calls `aggregate`       → rejected (wrong category for unstructured dataset)
 *   [1] AI calls `semanticSearch`  → succeeds
 *   [2] AI returns final answer
 */

import type { ChatWithToolsResponse } from "core.lib/adapters/ai";
import type { EvalCase } from "../types";

const DATASET_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const BASE_RESPONSE: Omit<ChatWithToolsResponse, "content" | "toolCalls"> = {
  completionTokens: 20,
  durationMs: 100,
  model: "mock-model",
  promptTokens: 100,
  reasoning: null,
  totalTokens: 120,
};

export const caseWrongToolType: EvalCase = {
  aiResponses: [
    // [0] Wrong tool: aggregate on an unstructured dataset (will be rejected)
    {
      ...BASE_RESPONSE,
      content: "",
      toolCalls: [
        {
          function: {
            arguments: {
              aggregations: [{ field: "term", operation: "count" }],
              datasetId: DATASET_ID,
            },
            name: "aggregate",
          },
        },
      ],
    },
    // [1] Correct tool after self-correction: semanticSearch
    {
      ...BASE_RESPONSE,
      content: "",
      toolCalls: [
        {
          function: {
            arguments: {
              datasetId: DATASET_ID,
              query: "key terms liability indemnification termination",
            },
            name: "semanticSearch",
          },
        },
      ],
    },
    // [2] Final answer
    {
      ...BASE_RESPONSE,
      completionTokens: 50,
      content:
        "The key terms in the document are: liability, indemnification, termination clause, and jurisdiction. Confidence: 0.75",
      toolCalls: [],
      totalTokens: 150,
    },
  ],
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
