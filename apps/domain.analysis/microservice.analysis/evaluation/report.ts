/**
 * Evaluation Report Generator
 *
 * Aggregates individual EvalResult objects into a summary EvalReport,
 * and provides helpers to print a human-readable console summary and
 * write the full report as JSON.
 */

import { writeFileSync } from "node:fs";
import type { EvalReport, EvalResult } from "./types";

/**
 * Build an EvalReport from a list of individual case results.
 *
 * A case is considered "failed" if at least one of its metric scores
 * did not pass (score below the metric's threshold).
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

const SEPARATOR = "─".repeat(60);

/**
 * Print a human-readable evaluation report to stdout.
 *
 * @param report - Aggregated report produced by generateReport
 */
export function printReport(report: EvalReport): void {
  console.log("\n=== Agent Evaluation Report ===");
  console.log(
    `Cases: ${report.totalCases}  Passed: ${report.passed}  Failed: ${report.failed}`,
  );
  console.log(SEPARATOR);

  for (const result of report.results) {
    const allPassed = result.scores.every((s) => s.passed);
    const icon = allPassed ? "✅" : "❌";
    const scoreStr = result.scores
      .map((s) => `${s.metricName}:${s.score.toFixed(2)}`)
      .join("  ");
    const errorStr = result.error ? `  [error: ${result.error}]` : "";
    console.log(`${result.caseId.padEnd(30)} ${icon}  ${scoreStr}${errorStr}`);
  }

  console.log(SEPARATOR);
  console.log("Aggregate Scores:");
  for (const [metric, score] of Object.entries(report.aggregateScores).sort()) {
    console.log(`  ${metric.padEnd(28)} ${score.toFixed(2)}`);
  }
  console.log();
}

/**
 * Write the full EvalReport as a JSON file.
 *
 * @param report - Aggregated report to serialise
 * @param filePath - Output path; defaults to `evaluation-report.json`
 */
export function writeJsonReport(
  report: EvalReport,
  filePath = "evaluation-report.json",
): void {
  writeFileSync(filePath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${filePath}`);
}
