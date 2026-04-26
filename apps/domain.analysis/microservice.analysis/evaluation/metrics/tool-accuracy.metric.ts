/**
 * Tool Accuracy Metric
 *
 * Checks whether the agent called the expected tools the required number
 * of times. When no expectations are defined for a case, returns N/A
 * with a perfect score of 1.0.
 *
 * Score = matched expectations / total expectations.
 * Passes if score >= 0.8.
 */

import type { EvalCase, EvalResult, ScoreResult } from "../types";

/**
 * Evaluate tool-call accuracy against the case's expectedToolCalls.
 *
 * @param evalCase - Evaluation case containing expected tool call patterns
 * @param result - Evaluation result containing the done message with toolsUsed
 * @returns Score result with name, score, pass flag, and reason
 */
export function toolAccuracyMetric(
  evalCase: EvalCase,
  result: EvalResult,
): ScoreResult {
  if (!evalCase.expectedToolCalls || evalCase.expectedToolCalls.length === 0) {
    return {
      metricName: "tool_accuracy",
      passed: true,
      reason: "No tool call expectations defined (N/A)",
      score: 1.0,
    };
  }

  const toolsUsed = result.doneMessage?.toolsUsed ?? [];
  const toolUseCounts = new Map<string, number>();
  for (const tool of toolsUsed) {
    toolUseCounts.set(
      tool.toolName,
      (toolUseCounts.get(tool.toolName) ?? 0) + 1,
    );
  }

  let matchedExpectations = 0;
  const reasons: string[] = [];

  for (const expectation of evalCase.expectedToolCalls) {
    const actualCount = toolUseCounts.get(expectation.toolName) ?? 0;
    const minRequired = expectation.minCalls ?? 1;
    const maxAllowed = expectation.maxCalls ?? Number.MAX_SAFE_INTEGER;

    if (actualCount >= minRequired && actualCount <= maxAllowed) {
      matchedExpectations++;
      reasons.push(
        `${expectation.toolName}: called ${actualCount}x (expected ≥${minRequired})`,
      );
    } else {
      reasons.push(
        `${expectation.toolName}: called ${actualCount}x but expected ≥${minRequired}` +
          (expectation.maxCalls !== undefined
            ? ` and ≤${expectation.maxCalls}`
            : ""),
      );
    }
  }

  const score = matchedExpectations / evalCase.expectedToolCalls.length;
  const passed = score >= 0.8;

  return {
    metricName: "tool_accuracy",
    passed,
    reason: reasons.join("; "),
    score,
  };
}
