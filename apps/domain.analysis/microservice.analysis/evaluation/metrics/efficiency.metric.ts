/**
 * Efficiency Metric
 *
 * Checks whether the agent resolved the query within the allowed number
 * of main-loop iterations. Each iteration emits a "Cooking..." reasoning
 * SSE event, which this metric counts.
 *
 * Score = min(1, maxIterations / actualIterations).
 * Passes if actualIterations <= maxIterations.
 */

import type { EvalCase, EvalResult, ScoreResult } from "../types";

const DEFAULT_MAX_ITERATIONS = 5;
const COOKING_STEP = "Cooking...";

/**
 * Evaluate how efficiently the agent reached its final answer.
 *
 * @param evalCase - Evaluation case with optional maxIterations bound
 * @param result - Evaluation result containing all SSE events
 * @returns Score result with name, score, pass flag, and reason
 */
export function efficiencyMetric(
  evalCase: EvalCase,
  result: EvalResult,
): ScoreResult {
  const maxIterations = evalCase.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const actualIterations = result.sseEvents.filter(
    (e) =>
      e.type === "reasoning" &&
      (e.payload as { step: string }).step === COOKING_STEP,
  ).length;

  if (actualIterations === 0) {
    return {
      metricName: "efficiency",
      passed: true,
      reason: "No iterations detected (likely an error path)",
      score: 1.0,
    };
  }

  const score = Math.min(1.0, maxIterations / actualIterations);
  const passed = actualIterations <= maxIterations;

  return {
    metricName: "efficiency",
    passed,
    reason: `Used ${actualIterations} iteration(s); max allowed: ${maxIterations}`,
    score,
  };
}
