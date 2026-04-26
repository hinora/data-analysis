# Local Agent Evals

This directory contains a local, rule-based evaluation framework for the agent. It runs predefined prompts, captures agent responses, scores them automatically, and writes a Markdown report.

## Run locally

```bash
npm run eval
npm run eval:mock
```

Both commands work without an external LLM API. By default, `npm run eval` uses the mock runner configured in `evals/eval.config.json`.

## Mock runner

`MockAgentRunner` returns deterministic responses. Use it to verify the evaluator, scoring rules, case loading, and report generation without starting a real agent.

```bash
npm run eval:mock
```

## Command runner

Set `AGENT_EVAL_COMMAND` to a local command that reads the prompt from stdin. The prompt is also provided in the `AGENT_EVAL_PROMPT` environment variable.

```bash
AGENT_EVAL_COMMAND="npm run agent --" npm run eval:command
```

The command runner captures stdout as the response. If the command exits with an error, stderr, exit code, and the error message are recorded in `evals/reports/latest.md`.

## Scoring

Scoring is rule-based in `evals/src/scoreResponse.ts`. It checks that responses:

- are not empty
- include expected keywords
- avoid forbidden keywords
- address prompt terms
- satisfy required behavior descriptions
- include code when `requiresCode` is true
- ask clarifying questions when `requiresClarification` is true
- avoid unsupported factual claims when data is unavailable

The `Judge` interface in `evals/src/types.ts` is a placeholder for optional LLM judge support later. It is intentionally unused in this first local-only version.

## Add eval cases

Add or edit JSON files in `evals/cases/`. Each file can contain one case or an array of cases:

```json
{
  "id": "missing-values-001",
  "category": "data-analysis",
  "prompt": "How do I handle missing values in a dataset?",
  "expectedKeywords": ["missing values", "null", "undefined", "impute"],
  "forbiddenKeywords": ["invent data", "make up values"],
  "requiredBehavior": [
    "mentions multiple strategies",
    "explains when to use each strategy"
  ],
  "requiresCode": false,
  "requiresClarification": false,
  "critical": false,
  "maxScore": 10
}
```

Use stable IDs and keep `maxScore` positive.

## Pass/fail thresholds

Configuration lives in `evals/eval.config.json`:

- `passingScorePercent`: minimum total score percentage for a passing run
- `criticalCategories`: category names treated as critical by convention
- `reportPath`: Markdown output path
- `defaultRunner`: `mock` or `command`

A run exits with code 0 when it passes. It exits with code 1 when the score is below the threshold, when a critical case scores 0, or when the evaluator crashes.

## Reports

Each run writes:

```text
evals/reports/latest.md
```

The report includes run metadata, total score, category scores, individual case reasons, and command errors.

## CI status

GitHub Actions, CI workflows, and pipeline automation are intentionally not included yet. These evals are local-only npm scripts.
