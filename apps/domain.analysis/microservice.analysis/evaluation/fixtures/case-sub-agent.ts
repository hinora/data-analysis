/**
 * Fixture: Sub-Agent Delegation
 *
 * The main agent delegates a detailed sales analysis to a sub-agent via
 * `createSubAgent`. The sub-agent independently calls `aggregate` and
 * returns findings that the main agent synthesises into a final answer.
 *
 * AI call sequence:
 *   [0] Main agent  → createSubAgent tool call
 *   [1] Sub-agent   → aggregate tool call
 *   [2] Sub-agent   → final sub-agent answer (no tool calls)
 *   [3] Main agent  → final answer incorporating sub-agent result
 */

import type { ChatWithToolsResponse } from "core.lib/adapters/ai";
import type { EvalCase } from "../types";

const DATASET_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const BASE_RESPONSE: Omit<ChatWithToolsResponse, "content" | "toolCalls"> = {
  completionTokens: 20,
  durationMs: 100,
  model: "mock-model",
  promptTokens: 100,
  reasoning: null,
  totalTokens: 120,
};

export const caseSubAgent: EvalCase = {
  aiResponses: [
    // [0] Main agent delegates to sub-agent
    {
      ...BASE_RESPONSE,
      content: "",
      toolCalls: [
        {
          function: {
            arguments: {
              prompt:
                "Perform a detailed analysis of sales performance by region using the aggregate tool and identify the top performing region.",
            },
            name: "createSubAgent",
          },
        },
      ],
    },
    // [1] Sub-agent: aggregate tool call
    {
      ...BASE_RESPONSE,
      content: "",
      toolCalls: [
        {
          function: {
            arguments: {
              aggregations: [{ field: "revenue", operation: "sum" }],
              datasetId: DATASET_ID,
              groupBy: ["region"],
              limit: 10,
              orderBy: { direction: "desc", field: "revenue" },
            },
            name: "aggregate",
          },
        },
      ],
    },
    // [2] Sub-agent: final answer
    {
      ...BASE_RESPONSE,
      completionTokens: 40,
      content:
        "Based on the aggregation, North America is the top performing region with $2.1M in revenue, followed by Europe at $1.4M.",
      toolCalls: [],
      totalTokens: 140,
    },
    // [3] Main agent: final synthesised answer
    {
      ...BASE_RESPONSE,
      completionTokens: 60,
      content:
        "Perform a detailed analysis of sales performance and identify the top performing region: North America leads with $2.1M in total revenue. The sub-agent analysis confirms consistent growth across all regions. Confidence: 0.88",
      toolCalls: [],
      totalTokens: 160,
    },
  ],
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
