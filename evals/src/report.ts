import { promises as fs } from "node:fs";
import path from "node:path";
import type { EvaluationResult, ScoreResult } from "./types";

export async function writeMarkdownReport(result: EvaluationResult, reportPath: string): Promise<void> {
  const absolutePath = path.resolve(process.cwd(), reportPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, generateMarkdownReport(result), "utf8");
}

export function generateMarkdownReport(result: EvaluationResult): string {
  return [
    "# Agent Evaluation Report",
    "",
    `Run Date: ${result.runDate}`,
    `Runner: ${result.runnerType}`,
    "",
    `Total Score: ${result.score} / ${result.maxScore}`,
    `Percentage: ${formatPercent(result.percentage)}`,
    `Status: ${result.passed ? "PASS" : "FAIL"}`,
    "",
    "## Category Scores",
    "",
    "| Category | Score | Max | Percentage |",
    "|---|---:|---:|---:|",
    ...result.categoryScores.map(
      (category) =>
        `| ${category.category} | ${category.score} | ${category.maxScore} | ${formatPercent(category.percentage)} |`,
    ),
    "",
    "## Case Results",
    "",
    ...result.caseResults.flatMap(formatCaseResult),
    ...formatCommandErrors(result),
  ].join("\n");
}

function formatCaseResult(result: ScoreResult): string[] {
  return [
    `### ${result.caseId}`,
    "",
    `Category: ${result.category}  `,
    `Score: ${result.score} / ${result.maxScore}  `,
    `Passed: ${result.passed}`,
    "",
    "Reasons:",
    ...result.reasons.map((reason) => `- ${reason}`),
    "",
  ];
}

function formatCommandErrors(result: EvaluationResult): string[] {
  if (result.commandErrors.length === 0) {
    return [];
  }
  return [
    "## Command Errors",
    "",
    ...result.commandErrors.flatMap((error) => [
      `### ${error.caseId}`,
      "",
      `Exit Code: ${error.exitCode ?? "unknown"}  `,
      `Error: ${error.error}`,
      "",
      ...(error.stderr ? ["Stderr:", "", "```", error.stderr, "```", ""] : []),
    ]),
  ];
}

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}
