# Agent Evaluation Framework

Local automatic evaluation and scoring framework for the `sendMessage` chat agent in `microservice.analysis`. Runs the real AI adapter against curated fixtures — no AI mocking, no predetermined tool call sequences.

## Overview

The evaluation framework measures real AI agent quality by:

1. **Running live scenarios** (fixtures) with the real AI provider configured via environment variables
2. **Scoring outputs** with five metrics covering faithfulness, relevance, tool accuracy, efficiency, and confidence calibration
3. **Generating structured reports** (console summary + `evaluation-report.json`)

This is an on-demand quality tool, not part of the Jest test suite.

## Architecture

```
evaluation/
├── types.ts                          ← Core interfaces (EvalCase, EvalResult, EvalReport…)
├── cli.ts                            ← Standalone entry point (npx tsx cli.ts)
├── runner.ts                         ← runEvaluation() — orchestrates the full pipeline
├── report.ts                         ← generateReport(), printReport(), writeJsonReport()
├── metrics/
│   ├── index.ts                      ← ALL_METRICS array + MetricRunner type
│   ├── faithfulness.metric.ts        ← Is the answer grounded in tool data?
│   ├── relevance.metric.ts           ← Does the answer address the question?
│   ├── tool-accuracy.metric.ts       ← Were the right tools called?
│   ├── efficiency.metric.ts          ← Did the agent finish within iteration budget?
│   └── confidence-calibration.metric.ts ← Did confidence meet the threshold?
├── fixtures/
│   ├── index.ts                      ← ALL_FIXTURES array
│   ├── case-structured-basic.ts      ← Simple aggregate query
│   ├── case-structured-filter.ts     ← Filtered aggregate (top-N with conditions)
│   ├── case-unstructured-rag.ts      ← Semantic search on unstructured dataset
│   ├── case-multi-iteration.ts       ← Two aggregate calls before final answer
│   ├── case-sub-agent.ts             ← createSubAgent delegation flow
│   ├── case-wrong-tool-type.ts       ← Self-correction after wrong-category tool call
│   └── case-confidence.ts            ← Explicit confidence score calibration
└── __tests__/
    └── runner.test.ts                ← Jest unit tests for metrics and report generator
```

## Running the Evaluation

### Prerequisites

1. Start the test database:
   ```bash
   docker compose up -d postgres-test
   ```

2. Configure your AI provider via environment variables (same as the microservice):
   ```bash
   # Google Gemini
   export AI_PROVIDER=gemini
   export GEMINI_API_KEY=your-key

   # Ollama (local)
   export AI_PROVIDER=ollama
   export OLLAMA_URL=http://localhost:11434
   ```

### Run

```bash
npm run eval:agent
```

The script connects to the test database (port 5433 by default — override with `ANALYSIS_DB_URI`), runs all 7 fixtures, and writes `evaluation-report.json` in the project root.

### Custom database

```bash
ANALYSIS_DB_URI=postgresql://user:pass@host:5432/mydb npm run eval:agent
```

## How It Works

### Flow Diagram

```mermaid
flowchart TD
    A[cli.ts: set env vars] --> B[Initialize dataSource from db/index.ts]
    B --> C[EvalCase fixture]
    C --> D[Clear & seed test DB]
    D --> E[Build merged callStubs]
    E --> F[Call sendMessageHandler with real AI]
    F --> G[Collect SSE events]
    G --> H[Extract done message]
    H --> I[Run ALL_METRICS]
    I --> J[EvalResult]
    J --> K[generateReport]
    K --> L[printReport + writeJsonReport]
```

### Real AI Adapter

The action calls `createAIAdapter()` naturally — whichever provider is configured via environment variables is used. No AI responses are pre-seeded. The AI decides:
- Which tool to call
- What parameters to pass
- When to stop iterating
- What confidence to report

### Call Stubs

`callStubs` in each fixture override `ctx.call()` for inter-service calls (tool execution, dataset metadata). The runner provides default stubs for common calls:

| Action | Default stub |
|--------|--------------|
| `chat.buildDynamicSystemPrompt` | `{ systemPrompt: "You are a data analysis assistant." }` |
| `chat.generateName` | `{ name: fixture.description }` |
| `conversation.renameConversation` | `{ success: true }` |
| `dataset.listDatasets` | Array from fixture.datasets |

Fixture-specific stubs (e.g. `tools.aggregate`, `dataset.getDataset`) are merged on top with fixture values taking priority. This is intentional — tool results are seeded so the AI can interpret realistic data without a running data microservice.

## Metrics Reference

### Faithfulness

**Goal:** Verify the answer is grounded in retrieved data rather than hallucinated.

**Heuristic:** `toolsUsed.length > 0 → score 1.0` | `empty → score 0.5`

**Threshold:** passes if score ≥ 0.5

**Future enhancement:** LLM-as-judge overlay to verify each claim maps to a specific tool result.

---

### Relevance

**Goal:** Verify the answer addresses the user's question.

**Heuristic:** Extract keywords from `userMessage` (words > 3 chars, excluding stop words), count matches in `doneMessage.content` (case-insensitive).

`score = matchedKeywords / totalKeywords` (capped at 1.0)

**Threshold:** passes if score ≥ 0.5

---

### Tool Accuracy

**Goal:** Verify the agent called the expected tools the required number of times.

**Formula:** `score = matched expectations / total expectations`

**Threshold:** passes if score ≥ 0.8

Only tools in `toolsUsed` (i.e. successfully executed) count. Tools rejected by dataset-type validation do not appear in `toolsUsed`.

---

### Efficiency

**Goal:** Verify the agent resolved the query without excessive back-and-forth.

**Method:** Count SSE events with `type: "reasoning"` and `step: "Cooking..."` (exactly, 3 ASCII periods). This equals the number of main-loop iterations. Sub-agent loops emit `[Sub-agent] Cooking…` (Unicode ellipsis) and are not counted.

**Formula:** `score = min(1, maxIterations / actualIterations)`

**Threshold:** passes if `actualIterations <= maxIterations`

---

### Confidence Calibration

**Goal:** Verify the agent's self-reported confidence meets the expected threshold.

The `extractConfidenceScore` function in the action parses `confidence: N` patterns (0–1 or 1–100 normalised) from the final answer.

**When `minConfidence` is set:** `score = confidenceScore ?? 0`, passes if `score >= minConfidence`

**When `minConfidence` is not set:** always passes, records `confidenceScore ?? 0.5`

## Adding a New Fixture

1. Create `evaluation/fixtures/case-<name>.ts` exporting a single `EvalCase` object.
2. Add it to `evaluation/fixtures/index.ts` and `ALL_FIXTURES`.
3. If needed, add a corresponding unit test in `__tests__/runner.test.ts`.

```typescript
// case-my-scenario.ts
import type { EvalCase } from "../types";

const DATASET_ID = "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx";

export const caseMyScenario: EvalCase = {
  id: "my-scenario",
  description: "Human-readable description",
  userMessage: "User question here",
  datasets: [{ id: DATASET_ID, name: "My Dataset", datasetType: "structured-table" }],
  callStubs: {
    "dataset.getDataset": { datasetType: "structured-table", id: DATASET_ID, name: "My Dataset" },
    "tools.aggregate": { results: [], totalGroups: 0, truncated: false },
  },
  expectedToolCalls: [{ toolName: "aggregate", minCalls: 1 }],
  maxIterations: 5,
  minConfidence: 0.8,
  referenceAnswer: "Expected answer for human review",
};
```

## Adding a New Metric

1. Create `evaluation/metrics/<name>.metric.ts` exporting a `MetricRunner` function.
2. Add it to `evaluation/metrics/index.ts` and `ALL_METRICS`.

```typescript
// evaluation/metrics/my-metric.metric.ts
import type { EvalCase, EvalResult, ScoreResult } from "../types";

export function myMetric(evalCase: EvalCase, result: EvalResult): ScoreResult {
  const score = /* compute 0–1 score */;
  return {
    metricName: "my_metric",
    passed: score >= 0.7,
    reason: `Explanation of the score`,
    score,
  };
}
```

## Fixture Catalogue

| ID | Description | Tools Expected | maxIterations |
|----|-------------|---------------|---------------|
| `structured-basic` | Simple aggregate — revenue by country | `aggregate` | 5 |
| `structured-filter` | Filtered aggregate — top 5 products in Germany | `aggregate` | 5 |
| `unstructured-rag` | Semantic search — key findings in report | `semanticSearch` | 5 |
| `multi-iteration` | Two aggregates — compare Q1 vs Q2 revenue | `aggregate` ×2 | 7 |
| `sub-agent` | Sub-agent delegation — sales performance by region | `createSubAgent` | 10 |
| `wrong-tool-type` | Self-correction after wrong-category tool call | `semanticSearch` | 7 |
| `confidence` | Explicit confidence calibration check | `aggregate` | 5 |

## Interpreting the Report

```
=== Agent Evaluation Report ===
Cases: 7  Passed: 6  Failed: 1
────────────────────────────────────────────────────────────
case-structured-basic          ✅  tool_accuracy:1.00  efficiency:1.00  faithfulness:1.00
case-wrong-tool-type           ✅  tool_accuracy:1.00  faithfulness:1.00
case-sub-agent                 ❌  tool_accuracy:0.50  [error: timeout]
────────────────────────────────────────────────────────────
Aggregate Scores:
  confidence_calibration        0.88
  efficiency                    0.92
  faithfulness                  0.86
  relevance                     0.78
  tool_accuracy                 0.93
```

### Acceptable thresholds (guidance)

| Metric | Target | Warning |
|--------|--------|---------|
| `tool_accuracy` | ≥ 0.85 | < 0.70 |
| `faithfulness` | ≥ 0.80 | < 0.60 |
| `relevance` | ≥ 0.65 | < 0.50 |
| `efficiency` | ≥ 0.80 | < 0.60 |
| `confidence_calibration` | ≥ 0.75 | < 0.50 |

## Future Enhancements

- **LLM-as-judge:** Use a lightweight judge model to verify faithfulness claim-by-claim.
- **Reference-answer similarity:** Add a `referenceSimilarity` metric using embedding cosine distance.
- **Latency percentiles:** Track p50/p99 `durationMs` across fixture runs.
- **Historical trending:** Persist `EvalReport` as JSON artefacts and plot metric trends over commits.
