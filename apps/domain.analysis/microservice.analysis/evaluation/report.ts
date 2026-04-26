/**
 * Evaluation Report Generator
 *
 * Aggregates individual EvalResult objects into a summary EvalReport.
 * A case is considered "failed" if at least one of its metric scores
 * did not pass (score below the metric's threshold).
 */

import type { EvalReport, EvalResult } from "./types";

/**
 * Build an EvalReport from a list of individual case results.
 *
 * @param req - Object containing results array
 * @returns Aggregated report with pass/fail counts and per-metric averages
 */
export function generateReport(req: { results: EvalResult[] }): EvalReport {
  const { results } = req;

  const passed = results.filter((r) => r.scores.every((s) => s.passed)).length;
  const failed = results.length - passed;

  // Calculate average score per metric across all cases
  const metricNames = [
    ...new Set(results.flatMap((r) => r.scores.map((s) => s.metricName))),
  ];

  const aggregateScores: Record<string, number> = {};
  for (const metricName of metricNames) {
    const scores = results.flatMap((r) =>
      r.scores.filter((s) => s.metricName === metricName).map((s) => s.score),
    );
    aggregateScores[metricName] =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  return {
    aggregateScores,
    failed,
    passed,
    results,
    timestamp: new Date().toISOString(),
    totalCases: results.length,
  };
}
