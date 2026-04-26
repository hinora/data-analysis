/**
 * Evaluation Runner
 *
 * Executes evaluation fixtures against the live sendMessage action using a
 * Jest-mocked AI adapter. For each fixture the runner:
 *   1. Clears and re-seeds the test database (Session + Conversation)
 *   2. Queues the fixture's `aiResponses` on the mock AI adapter
 *   3. Invokes `sendMessageHandler` and collects all SSE events
 *   4. Extracts the `done` event payload
 *   5. Runs all configured metric functions
 *   6. Returns the aggregated EvalReport
 *
 * The runner does NOT import sendMessage.action.ts directly so that Jest
 * module mocks (core.lib/adapters/ai, @toon-format/toon, db) can be set up
 * by the caller BEFORE the action module is loaded.
 *
 * Usage (inside a Jest test file):
 * ```ts
 * const report = await runEvaluation({
 *   dataSource: testDs,
 *   fixtures: ALL_FIXTURES,
 *   mockAI,
 *   sendMessageHandler: sendMessageAction.handler,
 * });
 * ```
 */

import type { PassThrough } from "node:stream";
import type { AIAdapter } from "core.lib/adapters/ai";
import { AILog } from "core.lib/database";
import { clearTestDatabase } from "core.lib/testing";
import type { DataSource } from "typeorm";
import { ChatMessage } from "../db/chat-message.entity";
import { Conversation } from "../db/conversation.entity";
import { Session, SessionStatus } from "../db/session.entity";
import type { StreamEventDone } from "../services/chat/sendMessage.action";
import { ALL_METRICS, type MetricRunner } from "./metrics";
import { generateReport } from "./report";
import type { EvalCase, EvalReport, EvalResult, ParsedSSEEvent } from "./types";

// ── Internal constants ────────────────────────────────────────────────────

/**
 * Fixed UUIDs reused across every fixture run (DB is cleared between runs).
 * Format: valid UUIDv4 (4xxx-8xxx variant).
 */
const EVAL_SESSION_ID = "e0000000-0000-4000-8000-000000000001";
const EVAL_CONVERSATION_ID = "e0000000-0000-4000-8000-000000000002";

/** Entities the runner needs to clear/seed between fixture runs. */
const EVAL_ENTITIES = [Session, Conversation, ChatMessage, AILog] as const;

// ── SSE helpers ───────────────────────────────────────────────────────────

/** Collect all SSE event frames from a PassThrough stream until it closes. */
function collectSSEEvents(
  stream: PassThrough,
): Promise<Array<{ data: string; type: string }>> {
  return new Promise((resolve) => {
    const events: Array<{ data: string; type: string }> = [];
    let buffer = "";

    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";

      for (const frame of frames) {
        const typeMatch = frame.match(/^event: (.+)$/m);
        const dataMatch = frame.match(/^data: (.+)$/m);
        if (typeMatch && dataMatch) {
          events.push({ data: dataMatch[1], type: typeMatch[1] });
        }
      }
    });

    stream.on("end", () => {
      if (buffer.trim()) {
        const typeMatch = buffer.match(/^event: (.+)$/m);
        const dataMatch = buffer.match(/^data: (.+)$/m);
        if (typeMatch && dataMatch) {
          events.push({ data: dataMatch[1], type: typeMatch[1] });
        }
      }
      resolve(events);
    });
  });
}

/** Parse raw SSE event frames into typed payload objects. */
function parseSSEEvents(
  events: Array<{ data: string; type: string }>,
): ParsedSSEEvent[] {
  return events.map((e) => ({ payload: JSON.parse(e.data), type: e.type }));
}

// ── DB seeding ────────────────────────────────────────────────────────────

/** Create a fresh Session and Conversation for a single fixture run. */
async function seedEvalConversation(req: {
  conversationId: string;
  dataSource: DataSource;
  sessionId: string;
}): Promise<void> {
  const { conversationId, dataSource, sessionId } = req;

  const sessionRepo = dataSource.getRepository(Session);
  const convRepo = dataSource.getRepository(Conversation);

  await sessionRepo.save(
    sessionRepo.create({
      conversationCount: 1,
      datasetCount: 0,
      id: sessionId,
      name: "Eval Session",
      status: SessionStatus.ACTIVE,
    }),
  );

  await convRepo.save(
    convRepo.create({
      id: conversationId,
      // messageCount: 1 prevents auto-rename from triggering,
      // which keeps the fixture stubs minimal.
      messageCount: 1,
      name: "Eval Conversation",
      sessionId,
      systemPrompt: "You are a data analysis assistant.",
    }),
  );
}

// ── Context factory ───────────────────────────────────────────────────────

/**
 * Build a minimal Moleculer-like context for the sendMessage action.
 * Uses plain async functions instead of jest.fn() so the runner can be
 * imported in non-Jest environments (e.g. future tsx CLI runner).
 */
function createEvalCtx(req: {
  callStubs: Record<string, unknown>;
  conversationId: string;
  userMessage: string;
  fixtureId: string;
}) {
  const { callStubs, conversationId, fixtureId, userMessage } = req;

  return {
    broker: {
      logger: {
        debug: (_msg: string) => {},
        error: (_msg: string) => {},
        fatal: (_msg: string) => {},
        info: (_msg: string) => {},
        trace: (_msg: string) => {},
        warn: (_msg: string) => {},
      },
    },
    broadcast: async () => {},
    call: async (actionName: string, ...args: unknown[]) => {
      const stub = callStubs[actionName];
      if (stub !== undefined) {
        return typeof stub === "function"
          ? (stub as (...a: unknown[]) => unknown)(...args)
          : stub;
      }
      throw new Error(
        `Unmocked ctx.call("${actionName}") in eval fixture "${fixtureId}". Add it to callStubs.`,
      );
    },
    emit: async () => {},
    meta: {} as Record<string, unknown>,
    params: { content: userMessage, conversationId },
  };
}

// ── Runner ────────────────────────────────────────────────────────────────

/**
 * Run the full evaluation suite and return an aggregated report.
 *
 * @param req - Configuration including fixtures, mock AI, and DB source
 * @returns Aggregated EvalReport with scores and pass/fail summary
 *
 * @example
 * ```ts
 * const report = await runEvaluation({
 *   dataSource: testDs,
 *   fixtures: [caseStructuredBasic],
 *   mockAI,
 *   sendMessageHandler: sendMessageAction.handler,
 * });
 * expect(report.passed).toBe(1);
 * ```
 */
export async function runEvaluation(req: {
  dataSource: DataSource;
  fixtures: EvalCase[];
  metrics?: MetricRunner[];
  mockAI: jest.Mocked<AIAdapter>;
  // biome-ignore lint/suspicious/noExplicitAny: handler ctx type varies per Moleculer version
  sendMessageHandler: (ctx: any) => PassThrough | Promise<PassThrough>;
}): Promise<EvalReport> {
  const {
    dataSource,
    fixtures,
    metrics = ALL_METRICS,
    mockAI,
    sendMessageHandler,
  } = req;

  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    // ── Reset state ─────────────────────────────────────────────────
    // biome-ignore lint/suspicious/noExplicitAny: EVAL_ENTITIES is readonly tuple
    await clearTestDatabase(dataSource, EVAL_ENTITIES as any);
    await seedEvalConversation({
      conversationId: EVAL_CONVERSATION_ID,
      dataSource,
      sessionId: EVAL_SESSION_ID,
    });

    // ── Queue mock AI responses ──────────────────────────────────────
    for (const response of fixture.aiResponses) {
      mockAI.chatWithTools.mockResolvedValueOnce(response);
    }

    // ── Build merged call stubs ──────────────────────────────────────
    // Basic stubs handle auto-rename helpers; fixture stubs take priority.
    const basicStubs: Record<string, unknown> = {
      "chat.buildDynamicSystemPrompt": {
        systemPrompt: "You are a data analysis assistant.",
      },
      "chat.generateName": { name: fixture.description },
      "conversation.renameConversation": { success: true },
      "dataset.listDatasets": fixture.datasets.map((d) => ({
        datasetType: d.datasetType,
        name: d.name,
        rowCount: 100,
      })),
    };

    const mergedStubs: Record<string, unknown> = {
      ...basicStubs,
      ...fixture.callStubs,
    };

    // ── Execute the action ───────────────────────────────────────────
    const ctx = createEvalCtx({
      callStubs: mergedStubs,
      conversationId: EVAL_CONVERSATION_ID,
      fixtureId: fixture.id,
      userMessage: fixture.userMessage,
    });

    const startTime = Date.now();
    let errorMsg: string | undefined;
    let sseEvents: ParsedSSEEvent[] = [];

    try {
      const stream = await Promise.resolve(sendMessageHandler(ctx));
      const rawEvents = await collectSSEEvents(stream);
      sseEvents = parseSSEEvents(rawEvents);
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - startTime;

    // ── Extract done message ─────────────────────────────────────────
    const doneEvent = sseEvents.find((e) => e.type === "done");
    const doneMessage = doneEvent
      ? (doneEvent.payload as { message: StreamEventDone["message"] }).message
      : null;

    // ── Score with all metrics ───────────────────────────────────────
    const evalResult: EvalResult = {
      caseId: fixture.id,
      doneMessage,
      durationMs,
      error: errorMsg,
      scores: [],
      sseEvents,
    };

    evalResult.scores = metrics.map((metric) => metric(fixture, evalResult));
    results.push(evalResult);
  }

  return generateReport({ results });
}
