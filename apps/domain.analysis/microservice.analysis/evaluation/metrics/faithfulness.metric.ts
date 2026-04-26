/**
 * Faithfulness Metric
 *
 * Checks whether the agent's answer is grounded in tool-retrieved data.
 * Heuristic: answers backed by at least one tool call score 1.0;
 * answers with no tool usage score 0.5 (possible hallucination).
 *
 * Note: An LLM-as-judge overlay for deeper grounding checks is
 * documented as a future enhancement in agent-evaluation.md.
 */

import type { EvalCase, EvalResult, ScoreResult } from "../types";

/**
 * Evaluate answer faithfulness.
 *
 * @param _evalCase - Evaluation case (unused by this heuristic metric)
 * @param result - Evaluation result containing the done message
 * @returns Score result with name, score, pass flag, and reason
 */
export function faithfulnessMetric(
  _evalCase: EvalCase,
  result: EvalResult,
): ScoreResult {
  const toolsUsed = result.doneMessage?.toolsUsed;
  const isGrounded = Array.isArray(toolsUsed) && toolsUsed.length > 0;

  const score = isGrounded ? 1.0 : 0.5;
  const passed = score >= 0.5;
  const reason = isGrounded
    ? `Answer is grounded in ${toolsUsed?.length ?? 0} tool result(s)`
    : "Answer has no tool citations; may not be grounded in data";

  return { metricName: "faithfulness", passed, reason, score };
}
