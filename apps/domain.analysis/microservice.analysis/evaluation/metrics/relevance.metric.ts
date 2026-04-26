/**
 * Relevance Metric
 *
 * Checks whether the agent's answer addresses the user's question.
 * Heuristic: extract meaningful keywords from the user message (words
 * longer than 3 characters, excluding common stop words) and count how
 * many appear in the final answer (case-insensitive).
 *
 * Score = matched keywords / total keywords (capped at 1.0).
 * Passes if score >= 0.5.
 */

import type { EvalCase, EvalResult, ScoreResult } from "../types";

const STOP_WORDS = new Set([
  "about",
  "also",
  "been",
  "does",
  "each",
  "from",
  "have",
  "into",
  "more",
  "most",
  "much",
  "only",
  "over",
  "same",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "those",
  "through",
  "what",
  "when",
  "where",
  "which",
  "while",
  "will",
  "with",
  "would",
  "your",
]);

/**
 * Evaluate relevance of the agent's answer to the user's question.
 *
 * @param evalCase - Evaluation case containing the user message
 * @param result - Evaluation result containing the done message
 * @returns Score result with name, score, pass flag, and reason
 */
export function relevanceMetric(
  evalCase: EvalCase,
  result: EvalResult,
): ScoreResult {
  const content = result.doneMessage?.content ?? "";

  if (!content) {
    return {
      metricName: "relevance",
      passed: false,
      reason: "No answer content to evaluate",
      score: 0,
    };
  }

  const keywords = evalCase.userMessage
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  if (keywords.length === 0) {
    return {
      metricName: "relevance",
      passed: true,
      reason: "No keywords to match (trivially passes)",
      score: 1.0,
    };
  }

  const lowerContent = content.toLowerCase();
  const matchedKeywords = keywords.filter((kw) => lowerContent.includes(kw));
  const score = Math.min(1.0, matchedKeywords.length / keywords.length);
  const passed = score >= 0.5;

  return {
    metricName: "relevance",
    passed,
    reason: `${matchedKeywords.length}/${keywords.length} keywords matched in answer`,
    score,
  };
}
