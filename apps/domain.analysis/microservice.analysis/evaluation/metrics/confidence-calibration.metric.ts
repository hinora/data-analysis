/**
 * Confidence Calibration Metric
 *
 * Checks whether the agent's self-reported confidence score meets the
 * threshold defined in the evaluation case.
 *
 * When `minConfidence` is set: passes if confidenceScore >= minConfidence.
 * When `minConfidence` is not set: always passes, records actual confidence
 * (or 0.5 as neutral default when no score was found in the response).
 */

import type { EvalCase, EvalResult, ScoreResult } from "../types";

/**
 * Evaluate confidence calibration against the case's minConfidence threshold.
 *
 * @param evalCase - Evaluation case with optional minConfidence threshold
 * @param result - Evaluation result containing the done message
 * @returns Score result with name, score, pass flag, and reason
 */
export function confidenceCalibrationMetric(
  evalCase: EvalCase,
  result: EvalResult,
): ScoreResult {
  const actualConfidence = result.doneMessage?.confidenceScore ?? null;

  if (evalCase.minConfidence !== undefined) {
    const score = actualConfidence ?? 0;
    const passed = score >= evalCase.minConfidence;
    return {
      metricName: "confidence_calibration",
      passed,
      reason: `Confidence ${score.toFixed(2)} vs minimum ${evalCase.minConfidence.toFixed(2)}`,
      score,
    };
  }

  const score = actualConfidence ?? 0.5;
  return {
    metricName: "confidence_calibration",
    passed: true,
    reason:
      actualConfidence !== null
        ? `Confidence ${score.toFixed(2)} (no minimum required)`
        : "No confidence score in response (no minimum required)",
    score,
  };
}
