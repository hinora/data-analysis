/**
 * Agent Evaluation Framework — Jest Test Suite
 *
 * Validates individual metric functions and the report generator in
 * isolation. No database, no AI adapter — pure unit tests only.
 *
 * The full end-to-end evaluation (real AI + real DB) is run via:
 *   npm run eval:agent
 */

import { caseStructuredBasic } from "../fixtures/case-structured-basic";
import {
  confidenceCalibrationMetric,
  efficiencyMetric,
  faithfulnessMetric,
  relevanceMetric,
  toolAccuracyMetric,
} from "../metrics";
import { generateReport } from "../report";
import type { EvalCase, EvalResult } from "../types";

// ── Helper ────────────────────────────────────────────────────────────────

/** Build a minimal EvalResult for metric unit tests. */
function makeResult(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    caseId: "test",
    doneMessage: null,
    durationMs: 100,
    scores: [],
    sseEvents: [],
    ...overrides,
  };
}

// ── Pure unit tests (no database required) ────────────────────────────────

describe("faithfulnessMetric", () => {
  it("should score 1.0 when toolsUsed is non-empty", () => {
    const evalCase = caseStructuredBasic;
    const result = makeResult({
      doneMessage: {
        citedSources: null,
        confidenceScore: null,
        content: "Answer.",
        conversationId: "x",
        createdAt: new Date(),
        id: "x",
        metadata: null,
        promptStats: null,
        reasoningSteps: null,
        role: "assistant",
        toolsUsed: [
          {
            parameters: {},
            resultSummary: "result",
            toolName: "aggregate",
          },
        ],
      },
    });

    const score = faithfulnessMetric(evalCase, result);
    expect(score.score).toBe(1.0);
    expect(score.passed).toBe(true);
  });

  it("should score 0.5 when toolsUsed is empty", () => {
    const evalCase = caseStructuredBasic;
    const result = makeResult({
      doneMessage: {
        citedSources: null,
        confidenceScore: null,
        content: "Answer.",
        conversationId: "x",
        createdAt: new Date(),
        id: "x",
        metadata: null,
        promptStats: null,
        reasoningSteps: null,
        role: "assistant",
        toolsUsed: [],
      },
    });

    const score = faithfulnessMetric(evalCase, result);
    expect(score.score).toBe(0.5);
    expect(score.passed).toBe(true);
  });
});

describe("relevanceMetric", () => {
  it("should score >= 0.5 when keywords appear in answer", () => {
    const evalCase: EvalCase = {
      ...caseStructuredBasic,
      userMessage: "What is the total revenue?",
    };
    const result = makeResult({
      doneMessage: {
        citedSources: null,
        confidenceScore: null,
        content: "The total revenue is $500,000.",
        conversationId: "x",
        createdAt: new Date(),
        id: "x",
        metadata: null,
        promptStats: null,
        reasoningSteps: null,
        role: "assistant",
        toolsUsed: null,
      },
    });

    const score = relevanceMetric(evalCase, result);
    expect(score.passed).toBe(true);
    expect(score.score).toBeGreaterThanOrEqual(0.5);
  });

  it("should fail when no keywords match", () => {
    const evalCase: EvalCase = {
      ...caseStructuredBasic,
      userMessage: "revenue country sales",
    };
    const result = makeResult({
      doneMessage: {
        citedSources: null,
        confidenceScore: null,
        content: "I do not know.",
        conversationId: "x",
        createdAt: new Date(),
        id: "x",
        metadata: null,
        promptStats: null,
        reasoningSteps: null,
        role: "assistant",
        toolsUsed: null,
      },
    });

    const score = relevanceMetric(evalCase, result);
    expect(score.passed).toBe(false);
  });
});

describe("toolAccuracyMetric", () => {
  it("should return score of 1.0 when no expectations are set", () => {
    const evalCase: EvalCase = {
      ...caseStructuredBasic,
      expectedToolCalls: [],
    };
    const result = makeResult();
    const score = toolAccuracyMetric(evalCase, result);
    expect(score.score).toBe(1.0);
    expect(score.passed).toBe(true);
  });

  it("should pass when expected tool is called the minimum times", () => {
    const evalCase: EvalCase = {
      ...caseStructuredBasic,
      expectedToolCalls: [{ minCalls: 1, toolName: "aggregate" }],
    };
    const result = makeResult({
      doneMessage: {
        citedSources: null,
        confidenceScore: null,
        content: "Done.",
        conversationId: "x",
        createdAt: new Date(),
        id: "x",
        metadata: null,
        promptStats: null,
        reasoningSteps: null,
        role: "assistant",
        toolsUsed: [
          {
            parameters: {},
            resultSummary: "result",
            toolName: "aggregate",
          },
        ],
      },
    });
    const score = toolAccuracyMetric(evalCase, result);
    expect(score.passed).toBe(true);
    expect(score.score).toBe(1.0);
  });

  it("should fail when expected tool is not called", () => {
    const evalCase: EvalCase = {
      ...caseStructuredBasic,
      expectedToolCalls: [{ minCalls: 1, toolName: "aggregate" }],
    };
    const result = makeResult({
      doneMessage: {
        citedSources: null,
        confidenceScore: null,
        content: "Done.",
        conversationId: "x",
        createdAt: new Date(),
        id: "x",
        metadata: null,
        promptStats: null,
        reasoningSteps: null,
        role: "assistant",
        toolsUsed: [],
      },
    });
    const score = toolAccuracyMetric(evalCase, result);
    expect(score.passed).toBe(false);
    expect(score.score).toBe(0);
  });
});

describe("efficiencyMetric", () => {
  it("should pass when actual iterations equal maxIterations", () => {
    const evalCase: EvalCase = { ...caseStructuredBasic, maxIterations: 2 };
    const result = makeResult({
      sseEvents: [
        { payload: { step: "Cooking..." }, type: "reasoning" },
        { payload: { step: "Cooking..." }, type: "reasoning" },
      ],
    });
    const score = efficiencyMetric(evalCase, result);
    expect(score.passed).toBe(true);
    expect(score.score).toBe(1.0);
  });

  it("should fail when actual iterations exceed maxIterations", () => {
    const evalCase: EvalCase = { ...caseStructuredBasic, maxIterations: 2 };
    const result = makeResult({
      sseEvents: [
        { payload: { step: "Cooking..." }, type: "reasoning" },
        { payload: { step: "Cooking..." }, type: "reasoning" },
        { payload: { step: "Cooking..." }, type: "reasoning" },
        { payload: { step: "Cooking..." }, type: "reasoning" },
      ],
    });
    const score = efficiencyMetric(evalCase, result);
    expect(score.passed).toBe(false);
    expect(score.score).toBeLessThan(1.0);
  });

  it("should not count sub-agent Cooking… steps", () => {
    const evalCase: EvalCase = { ...caseStructuredBasic, maxIterations: 3 };
    const result = makeResult({
      sseEvents: [
        { payload: { step: "Cooking..." }, type: "reasoning" },
        // Sub-agent step uses Unicode ellipsis, not 3 ASCII dots
        { payload: { step: "[Sub-agent] Cooking…" }, type: "reasoning" },
        { payload: { step: "Cooking..." }, type: "reasoning" },
      ],
    });
    const score = efficiencyMetric(evalCase, result);
    // Only 2 main-loop Cooking... events; maxIterations is 3 → passes
    expect(score.passed).toBe(true);
  });
});

describe("confidenceCalibrationMetric", () => {
  it("should pass when confidence meets the minimum threshold", () => {
    const evalCase: EvalCase = { ...caseStructuredBasic, minConfidence: 0.8 };
    const result = makeResult({
      doneMessage: {
        citedSources: null,
        confidenceScore: 0.9,
        content: "Answer. Confidence: 0.9",
        conversationId: "x",
        createdAt: new Date(),
        id: "x",
        metadata: null,
        promptStats: null,
        reasoningSteps: null,
        role: "assistant",
        toolsUsed: null,
      },
    });
    const score = confidenceCalibrationMetric(evalCase, result);
    expect(score.passed).toBe(true);
    expect(score.score).toBeCloseTo(0.9, 3);
  });

  it("should fail when confidence is below the minimum threshold", () => {
    const evalCase: EvalCase = { ...caseStructuredBasic, minConfidence: 0.8 };
    const result = makeResult({
      doneMessage: {
        citedSources: null,
        confidenceScore: 0.6,
        content: "Answer. Confidence: 0.6",
        conversationId: "x",
        createdAt: new Date(),
        id: "x",
        metadata: null,
        promptStats: null,
        reasoningSteps: null,
        role: "assistant",
        toolsUsed: null,
      },
    });
    const score = confidenceCalibrationMetric(evalCase, result);
    expect(score.passed).toBe(false);
    expect(score.score).toBeCloseTo(0.6, 3);
  });

  it("should always pass when no minConfidence is set", () => {
    const evalCase: EvalCase = {
      ...caseStructuredBasic,
      minConfidence: undefined,
    };
    const result = makeResult({
      doneMessage: {
        citedSources: null,
        confidenceScore: 0.3,
        content: "Uncertain answer.",
        conversationId: "x",
        createdAt: new Date(),
        id: "x",
        metadata: null,
        promptStats: null,
        reasoningSteps: null,
        role: "assistant",
        toolsUsed: null,
      },
    });
    const score = confidenceCalibrationMetric(evalCase, result);
    expect(score.passed).toBe(true);
  });
});

describe("generateReport", () => {
  it("should count passed/failed correctly", () => {
    const results: EvalResult[] = [
      makeResult({
        caseId: "a",
        scores: [
          { metricName: "faithfulness", passed: true, reason: "", score: 1 },
        ],
      }),
      makeResult({
        caseId: "b",
        scores: [
          {
            metricName: "faithfulness",
            passed: false,
            reason: "",
            score: 0.3,
          },
        ],
      }),
    ];
    const report = generateReport({ results });
    expect(report.totalCases).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
  });

  it("should compute average aggregate scores", () => {
    const results: EvalResult[] = [
      makeResult({
        scores: [
          { metricName: "faithfulness", passed: true, reason: "", score: 1.0 },
        ],
      }),
      makeResult({
        scores: [
          { metricName: "faithfulness", passed: true, reason: "", score: 0.5 },
        ],
      }),
    ];
    const report = generateReport({ results });
    expect(report.aggregateScores.faithfulness).toBeCloseTo(0.75, 3);
  });

  it("should include a timestamp in ISO format", () => {
    const report = generateReport({ results: [] });
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
