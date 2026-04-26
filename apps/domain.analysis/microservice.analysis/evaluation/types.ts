/**
 * Evaluation Framework Types
 *
 * Core types for the local automatic evaluation/scoring framework
 * for the sendMessage agent. Each EvalCase defines the scenario,
 * expected behaviour, and the tool-execution stubs used by the runner.
 * The AI adapter is always real — no mock AI responses are seeded here.
 */

import type { StreamEventDone } from "../services/chat/sendMessage.action";

/** Metadata about a dataset referenced in an evaluation case. */
export interface EvalDataset {
  datasetType: "structured-table" | "unstructured-text";
  id: string;
  name: string;
}

/** Expected tool call pattern for the tool-accuracy metric. */
export interface ToolCallExpectation {
  maxCalls?: number;
  minCalls?: number;
  requiredArgs?: Record<string, unknown>;
  toolName: string;
}

/**
 * A single evaluation scenario.
 *
 * `callStubs` are merged on top of the runner's basic stubs (dataset lists,
 * system-prompt builder, etc.) so each fixture only needs to supply stubs
 * that are specific to its scenario (e.g. `tools.aggregate` results,
 * `dataset.getDataset` metadata). The AI adapter is real — no pre-seeded
 * AI responses are required.
 */
export interface EvalCase {
  /** ctx.call stubs keyed by action name, merged with the runner's basic stubs. */
  callStubs: Record<string, unknown>;
  /** Datasets referenced in this scenario (metadata only, no DB records). */
  datasets: EvalDataset[];
  /** Human-readable description shown in reports. */
  description: string;
  /** Expected tool-call patterns checked by the tool-accuracy metric. */
  expectedToolCalls?: ToolCallExpectation[];
  /** Unique identifier for this case. */
  id: string;
  /** Maximum number of main-loop iterations allowed (default: 5). */
  maxIterations?: number;
  /** Minimum acceptable confidence score (checked by confidence-calibration metric). */
  minConfidence?: number;
  /** Reference answer used for future LLM-as-judge overlay. */
  referenceAnswer?: string;
  /** The user message sent to the agent. */
  userMessage: string;
}

/** Result of a single metric evaluation. */
export interface ScoreResult {
  metricName: string;
  passed: boolean;
  reason: string;
  score: number;
}

/** Parsed SSE event from the agent stream. */
export interface ParsedSSEEvent {
  payload: unknown;
  type: string;
}

/** Evaluation result for a single EvalCase run. */
export interface EvalResult {
  caseId: string;
  /** The `done` event message payload, or null if no done event was received. */
  doneMessage: StreamEventDone["message"] | null;
  durationMs: number;
  error?: string;
  scores: ScoreResult[];
  sseEvents: ParsedSSEEvent[];
}

/** Aggregated evaluation report across all cases. */
export interface EvalReport {
  /** Average score per metric across all cases. */
  aggregateScores: Record<string, number>;
  /** Number of cases where at least one metric did not pass. */
  failed: number;
  /** Number of cases where every metric passed. */
  passed: number;
  results: EvalResult[];
  timestamp: string;
  totalCases: number;
}
