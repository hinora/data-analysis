/**
 * Agent Evaluation Framework — Jest Test Suite
 *
 * Tests the evaluation runner end-to-end on a subset of fixtures, and
 * validates individual metric functions in isolation.
 *
 * Run the full evaluation suite with:
 *   npm run eval:agent
 *
 * Run just this test file with:
 *   npx jest evaluation/__tests__/runner
 */

import { AILog } from "core.lib/database";
import {
  aiDefaults,
  clearTestDatabase,
  createMockAIAdapter,
  createTestDataSource,
  destroyTestDataSource,
} from "core.lib/testing";
import type { DataSource } from "typeorm";
import { ChatMessage } from "../../db/chat-message.entity";
import { Conversation } from "../../db/conversation.entity";
import { Session } from "../../db/session.entity";

// ── Mocks (must be declared before any import of the action) ──────────────

const mockAI = createMockAIAdapter();

jest.mock("core.lib/adapters/ai", () => ({
  createAIAdapter: () => mockAI,
}));

jest.mock("@toon-format/toon", () => ({
  encode: jest.fn((val: unknown) => JSON.stringify(val)),
}));

let testDs: DataSource;

jest.mock("../../db", () => ({
  get dataSource() {
    return testDs;
  },
  ChatMessage,
  Conversation,
  Session,
}));

jest.mock("../../toolConfig", () => {
  const original = jest.requireActual("../../toolConfig");
  return { ...original };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────

import sendMessageAction from "../../services/chat/sendMessage.action";
import { caseConfidence } from "../fixtures/case-confidence";
import { caseStructuredBasic } from "../fixtures/case-structured-basic";
import { caseWrongToolType } from "../fixtures/case-wrong-tool-type";
import {
  confidenceCalibrationMetric,
  efficiencyMetric,
  faithfulnessMetric,
  relevanceMetric,
  toolAccuracyMetric,
} from "../metrics";
import { generateReport } from "../report";
import { runEvaluation } from "../runner";
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

describe("fixture AI response shapes", () => {
  it("should match the aiDefaults.chatWithToolsResult shape", () => {
    const { toolCalls, content, ...baseFields } =
      aiDefaults.chatWithToolsResult;
    const fixtureResponse = caseStructuredBasic.aiResponses[1];

    expect(fixtureResponse).toMatchObject({
      completionTokens: expect.any(Number),
      content: expect.any(String),
      durationMs: expect.any(Number),
      model: expect.any(String),
      promptTokens: expect.any(Number),
      totalTokens: expect.any(Number),
    });

    // Suppress unused variable lint
    void baseFields;
    void toolCalls;
    void content;
  });
});

// ── Integration tests (require PostgreSQL) ────────────────────────────────

const DB_ENTITIES = [Session, Conversation, ChatMessage, AILog];

describe("runEvaluation (integration)", () => {
  beforeAll(async () => {
    testDs = await createTestDataSource(DB_ENTITIES);
  });

  afterAll(async () => {
    await destroyTestDataSource(testDs);
  });

  beforeEach(async () => {
    await clearTestDatabase(testDs, DB_ENTITIES);
    jest.clearAllMocks();
  });

  it("should run caseStructuredBasic and emit a done event", async () => {
    const report = await runEvaluation({
      dataSource: testDs,
      fixtures: [caseStructuredBasic],
      mockAI,
      sendMessageHandler: sendMessageAction.handler,
    });

    expect(report.totalCases).toBe(1);
    expect(report.results[0].caseId).toBe("structured-basic");
    expect(report.results[0].error).toBeUndefined();
    expect(report.results[0].doneMessage).not.toBeNull();
    expect(report.results[0].doneMessage?.content).toContain("revenue");
  });

  it("should pass tool_accuracy for caseStructuredBasic", async () => {
    const report = await runEvaluation({
      dataSource: testDs,
      fixtures: [caseStructuredBasic],
      mockAI,
      sendMessageHandler: sendMessageAction.handler,
    });

    const toolAccuracy = report.results[0].scores.find(
      (s) => s.metricName === "tool_accuracy",
    );
    expect(toolAccuracy).toBeDefined();
    expect(toolAccuracy?.passed).toBe(true);
    expect(toolAccuracy?.score).toBeGreaterThanOrEqual(0.8);
  });

  it("should pass confidence_calibration for caseStructuredBasic (minConfidence 0.8)", async () => {
    const report = await runEvaluation({
      dataSource: testDs,
      fixtures: [caseStructuredBasic],
      mockAI,
      sendMessageHandler: sendMessageAction.handler,
    });

    const calibration = report.results[0].scores.find(
      (s) => s.metricName === "confidence_calibration",
    );
    expect(calibration).toBeDefined();
    expect(calibration?.passed).toBe(true);
    expect(calibration?.score).toBeCloseTo(0.9, 1);
  });

  it("should include all five metric scores in results", async () => {
    const report = await runEvaluation({
      dataSource: testDs,
      fixtures: [caseStructuredBasic],
      mockAI,
      sendMessageHandler: sendMessageAction.handler,
    });

    const metricNames = report.results[0].scores.map((s) => s.metricName);
    expect(metricNames).toContain("faithfulness");
    expect(metricNames).toContain("relevance");
    expect(metricNames).toContain("tool_accuracy");
    expect(metricNames).toContain("efficiency");
    expect(metricNames).toContain("confidence_calibration");
  });

  it("should include aggregate scores for all metrics in the report", async () => {
    const report = await runEvaluation({
      dataSource: testDs,
      fixtures: [caseStructuredBasic],
      mockAI,
      sendMessageHandler: sendMessageAction.handler,
    });

    expect(report.aggregateScores).toHaveProperty("faithfulness");
    expect(report.aggregateScores).toHaveProperty("relevance");
    expect(report.aggregateScores).toHaveProperty("tool_accuracy");
    expect(report.aggregateScores).toHaveProperty("efficiency");
    expect(report.aggregateScores).toHaveProperty("confidence_calibration");
  });

  it("should run caseWrongToolType and record semanticSearch in toolsUsed", async () => {
    const report = await runEvaluation({
      dataSource: testDs,
      fixtures: [caseWrongToolType],
      mockAI,
      sendMessageHandler: sendMessageAction.handler,
    });

    expect(report.results[0].error).toBeUndefined();
    expect(report.results[0].doneMessage).not.toBeNull();

    const toolsUsed = report.results[0].doneMessage?.toolsUsed ?? [];
    const usedNames = toolsUsed.map((t) => t.toolName);
    expect(usedNames).toContain("semanticSearch");
    expect(usedNames).not.toContain("aggregate");
  });

  it("should run caseConfidence and pass confidence_calibration", async () => {
    const report = await runEvaluation({
      dataSource: testDs,
      fixtures: [caseConfidence],
      mockAI,
      sendMessageHandler: sendMessageAction.handler,
    });

    const calibration = report.results[0].scores.find(
      (s) => s.metricName === "confidence_calibration",
    );
    expect(calibration?.passed).toBe(true);
    expect(calibration?.score).toBeGreaterThanOrEqual(0.8);
  });

  it("should run multiple fixtures and clear DB between them", async () => {
    const report = await runEvaluation({
      dataSource: testDs,
      fixtures: [caseStructuredBasic, caseConfidence],
      mockAI,
      sendMessageHandler: sendMessageAction.handler,
    });

    expect(report.totalCases).toBe(2);
    expect(report.results[0].caseId).toBe("structured-basic");
    expect(report.results[1].caseId).toBe("confidence");
    expect(report.results[0].error).toBeUndefined();
    expect(report.results[1].error).toBeUndefined();
  });
});
