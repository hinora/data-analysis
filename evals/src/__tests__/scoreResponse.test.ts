import { generateMarkdownReport } from "../report";
import { calculateCategoryScores, scoreResponse } from "../scoreResponse";
import type { EvalCase, EvaluationResult, ScoreResult } from "../types";

const baseCase: EvalCase = {
  category: "data-analysis",
  critical: false,
  expectedKeywords: [],
  forbiddenKeywords: [],
  id: "case-001",
  maxScore: 10,
  prompt: "How do I handle missing values?",
  requiredBehavior: [],
  requiresClarification: false,
  requiresCode: false,
};

describe("scoreResponse", () => {
  it("rewards expected keywords", () => {
    const result = scoreResponse(
      { ...baseCase, expectedKeywords: ["missing values", "impute"] },
      "Handle missing values with impute strategies.",
    );

    expect(result.score).toBeGreaterThanOrEqual(8);
    expect(result.reasons).toContain("Found expected keyword: missing values");
  });

  it("penalizes forbidden keywords", () => {
    const clean = scoreResponse({ ...baseCase, forbiddenKeywords: ["invent data"] }, "Use missing data checks.");
    const forbidden = scoreResponse(
      { ...baseCase, forbiddenKeywords: ["invent data"] },
      "You can invent data for missing values.",
    );

    expect(forbidden.score).toBeLessThan(clean.score);
    expect(forbidden.reasons).toContain("Found forbidden keyword: invent data");
  });

  it("fails empty responses", () => {
    const result = scoreResponse(baseCase, "   ");

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("detects required code", () => {
    const result = scoreResponse(
      { ...baseCase, requiresCode: true },
      "```ts\nconst value = 1;\n```",
    );

    expect(result.reasons).toContain("Included code-like content");
  });

  it("detects clarification questions", () => {
    const result = scoreResponse(
      { ...baseCase, requiresClarification: true },
      "Which dataset and goal should I use?",
    );

    expect(result.reasons).toContain("Asked a clarifying question");
  });

  it("penalizes hallucinated facts in critical cases", () => {
    const result = scoreResponse(
      { ...baseCase, category: "hallucination", critical: true, prompt: "What is the average age?" },
      "The average is 32% based on your data.",
    );

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });
});

describe("calculateCategoryScores", () => {
  it("calculates category scores", () => {
    const results: ScoreResult[] = [
      { caseId: "a", category: "one", maxScore: 10, passed: true, reasons: [], score: 8 },
      { caseId: "b", category: "one", maxScore: 10, passed: true, reasons: [], score: 7 },
      { caseId: "c", category: "two", maxScore: 5, passed: true, reasons: [], score: 5 },
    ];

    expect(calculateCategoryScores(results)).toEqual([
      { category: "one", maxScore: 20, percentage: 75, score: 15 },
      { category: "two", maxScore: 5, percentage: 100, score: 5 },
    ]);
  });
});

describe("generateMarkdownReport", () => {
  it("generates a Markdown report", () => {
    const result: EvaluationResult = {
      caseResults: [{ caseId: "a", category: "one", maxScore: 10, passed: true, reasons: ["ok"], score: 8 }],
      categoryScores: [{ category: "one", maxScore: 10, percentage: 80, score: 8 }],
      commandErrors: [],
      maxScore: 10,
      passed: true,
      percentage: 80,
      runDate: "2026-04-26T12:00:00.000Z",
      runnerType: "MockAgentRunner",
      score: 8,
    };

    const markdown = generateMarkdownReport(result);

    expect(markdown).toContain("# Agent Evaluation Report");
    expect(markdown).toContain("Runner: MockAgentRunner");
    expect(markdown).toContain("### a");
  });
});
