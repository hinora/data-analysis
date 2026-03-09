/**
 * Send Message Action
 *
 * Core chat action with SSE streaming: saves user message, loads system prompt +
 * conversation history, runs AI tool-calling orchestration loop (max 10 iterations),
 * executes tools via ctx.call to microservice.data, saves assistant message with
 * confidence/citations/tools/reasoning, and logs to AILog.
 *
 * Returns a Server-Sent Events stream that pushes real-time progress events
 * (reasoning steps, tool calls, content deltas) to the client while processing.
 */

import { PassThrough } from "node:stream";
import type { TypedContext } from "core.lib/__generated__";
import type { AIMessageWithTools } from "core.lib/adapters/ai";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { AILog, AILogStatus, AILogType } from "core.lib/database";
import { dataSource } from "../../db";
import type { CitedSource, ToolUsage } from "../../db/chat-message.entity";
import { ChatMessage, MessageRole } from "../../db/chat-message.entity";
import { Conversation } from "../../db/conversation.entity";
import {
  getDefaultToolEnabledConfig,
  getEnabledToolActions,
  getEnabledToolDefinitions,
} from "../../toolConfig";

export interface SendMessageParams {
  content: string;
  conversationId: string;
}

/**
 * The action returns a Node.js PassThrough stream. moleculer-web pipes it
 * directly to the HTTP response as `text/event-stream`.
 */
export type SendMessageResult = PassThrough;

// ── SSE event types ─────────────────────────────────────────────────────

export interface StreamEventStatus {
  message: string;
  type: "status";
}

export interface StreamEventToolStart {
  parameters: Record<string, unknown>;
  toolName: string;
  type: "tool_start";
}

export interface StreamEventToolEnd {
  durationMs: number;
  resultPreview: string;
  success: boolean;
  toolName: string;
  type: "tool_end";
}

export interface StreamEventReasoning {
  step: string;
  type: "reasoning";
}

export interface StreamEventContentDelta {
  delta: string;
  type: "content_delta";
}

export interface StreamEventDone {
  message: {
    citedSources: CitedSource[] | null;
    confidenceScore: number | null;
    content: string;
    conversationId: string;
    createdAt: Date;
    id: string;
    reasoningSteps: string[] | null;
    role: string;
    toolsUsed: ToolUsage[] | null;
  };
  type: "done";
}

export interface StreamEventError {
  message: string;
  type: "error";
}

export type StreamEvent =
  | StreamEventContentDelta
  | StreamEventDone
  | StreamEventError
  | StreamEventReasoning
  | StreamEventStatus
  | StreamEventToolEnd
  | StreamEventToolStart;

// ── Constants & config ──────────────────────────────────────────────────

const MAX_TOOL_ITERATIONS = 20;
const toolEnabledConfig = getDefaultToolEnabledConfig();
const TOOL_TO_ACTION = getEnabledToolActions(toolEnabledConfig);

// ── Helpers ─────────────────────────────────────────────────────────────

/** Write a single SSE event frame to the stream. */
function writeSSE(stream: PassThrough, event: StreamEvent): void {
  stream.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

/** Truncate a string to a maximum length, appending "…" if truncated. */
function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

// ── Action ──────────────────────────────────────────────────────────────

export default defineAction<SendMessageParams, SendMessageResult>({
  rest: "POST /messages",

  params: {
    content: { type: "string", max: 10000, min: 1 },
    conversationId: { type: "uuid" },
  },

  async handler(ctx: TypedContext<SendMessageParams>) {
    // Tell moleculer-web to treat the response as an SSE stream.
    (ctx.meta as Record<string, unknown>).$responseType = "text/event-stream";
    (ctx.meta as Record<string, unknown>).$responseHeaders = {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    };

    const stream = new PassThrough();

    // Fire off the long-running orchestration loop without blocking the
    // return – moleculer-web will pipe the returned stream to the HTTP response.
    processStream(ctx, stream).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      writeSSE(stream, { type: "error", message: errMsg });
      stream.end();
    });

    return stream;
  },
});

// ── Orchestration loop (runs asynchronously) ────────────────────────────

async function processStream(
  ctx: TypedContext<SendMessageParams>,
  stream: PassThrough,
): Promise<void> {
  const { content, conversationId } = ctx.params;
  const convRepo = dataSource.getRepository(Conversation);
  const msgRepo = dataSource.getRepository(ChatMessage);
  const aiLogRepo = dataSource.getRepository(AILog);

  // ── Verify conversation exists ──────────────────────────────────────
  writeSSE(stream, { type: "status", message: "Verifying conversation…" });

  const conversation = await convRepo.findOneBy({ id: conversationId });
  if (!conversation) {
    writeSSE(stream, {
      type: "error",
      message: "Conversation not found",
    });
    stream.end();
    return;
  }

  const sessionId = conversation.sessionId;

  // ── Build system prompt ─────────────────────────────────────────────
  writeSSE(stream, { type: "status", message: "Building context…" });

  const { systemPrompt } = await ctx.call("chat.buildDynamicSystemPrompt", {
    sessionId,
  });
  await convRepo.update({ id: conversationId }, { systemPrompt });

  // ── Save user message ───────────────────────────────────────────────
  const userMessage = msgRepo.create({
    content,
    conversationId,
    role: MessageRole.USER,
    sessionId,
  });
  await msgRepo.save(userMessage);

  // ── Load conversation history ───────────────────────────────────────
  writeSSE(stream, { type: "status", message: "Loading history…" });

  const history = await msgRepo.find({
    order: { createdAt: "ASC" },
    where: { conversationId },
  });

  const messages: AIMessageWithTools[] = [
    { content: systemPrompt, role: "system" },
    ...history
      .filter((m) => m.role !== MessageRole.SYSTEM)
      .map((m) => ({
        content: m.content,
        role: m.role as "assistant" | "user",
      })),
  ];

  // ── Tool definitions ────────────────────────────────────────────────
  const tools = getEnabledToolDefinitions(toolEnabledConfig);
  const ai = createAIAdapter();

  const reasoningSteps: string[] = [];
  const toolsUsed: ToolUsage[] = [];
  const citedSources: CitedSource[] = [];
  let finalContent = "";
  let confidenceScore: number | null = null;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const startTime = Date.now();

  // ── AI orchestration loop ───────────────────────────────────────────
  writeSSE(stream, { type: "status", message: "Thinking…" });

  try {
    let iteration = 0;

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      writeSSE(stream, {
        type: "reasoning",
        step: `calling AI model…`,
      });

      const response = await ai.chatWithTools({
        messages,
        onReasoning: (chunk: string) => {
          reasoningSteps.push(chunk);
          writeSSE(stream, { type: "reasoning", step: chunk });
        },
        tools: iteration <= MAX_TOOL_ITERATIONS - 1 ? tools : [],
      });

      totalPromptTokens += response.promptTokens || 0;
      totalCompletionTokens += response.completionTokens || 0;

      // ── Tool calls ────────────────────────────────────────────────
      if (response.toolCalls && response.toolCalls.length > 0) {
        messages.push({
          _rawAssistantParts: response._rawAssistantParts,
          content: response.content || "",
          role: "assistant",
          toolCalls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          const fnName = toolCall.function.name;
          const fnArgs = toolCall.function.arguments;
          const actionName = TOOL_TO_ACTION[fnName];

          const stepDesc = `Calling tool: ${fnName}(${JSON.stringify(fnArgs)})`;
          reasoningSteps.push(stepDesc);
          writeSSE(stream, { type: "reasoning", step: stepDesc });
          writeSSE(stream, {
            type: "tool_start",
            toolName: fnName,
            parameters: fnArgs,
          });

          if (!actionName) {
            reasoningSteps.push(`Unknown tool: ${fnName} — skipped`);
            writeSSE(stream, {
              type: "tool_end",
              durationMs: 0,
              resultPreview: "Tool not available",
              success: false,
              toolName: fnName,
            });
            messages.push({
              content: `Tool ${fnName} is not available.`,
              role: "tool",
              toolName: fnName,
            });
            continue;
          }

          try {
            const toolStart = Date.now();
            const result = await (
              ctx as unknown as {
                call: (
                  name: string,
                  params: Record<string, unknown>,
                ) => Promise<unknown>;
              }
            ).call(actionName, fnArgs);
            const toolDuration = Date.now() - toolStart;

            const resultStr =
              typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2);

            toolsUsed.push({
              parameters: fnArgs,
              resultSummary: resultStr,
              toolName: fnName,
            });

            const stepResult = `Tool ${fnName} returned (${toolDuration}ms)`;
            reasoningSteps.push(stepResult);
            writeSSE(stream, { type: "reasoning", step: stepResult });
            writeSSE(stream, {
              type: "tool_end",
              durationMs: toolDuration,
              resultPreview: truncate(resultStr, 200),
              success: true,
              toolName: fnName,
            });

            messages.push({
              content: resultStr,
              role: "tool",
              toolName: fnName,
            });

            // Track cited sources
            if (fnArgs.datasetId) {
              const existing = citedSources.find(
                (s) => s.datasetId === fnArgs.datasetId,
              );
              if (!existing) {
                citedSources.push({
                  datasetId: fnArgs.datasetId as string,
                  datasetName:
                    (fnArgs.datasetName as string) || "Unknown Dataset",
                  columnName: fnArgs.field as string | undefined,
                });
              }
            }
          } catch (toolErr: unknown) {
            const errMsg =
              toolErr instanceof Error ? toolErr.message : String(toolErr);
            const stepFail = `Tool ${fnName} failed: ${errMsg}`;
            reasoningSteps.push(stepFail);
            writeSSE(stream, { type: "reasoning", step: stepFail });
            writeSSE(stream, {
              type: "tool_end",
              durationMs: 0,
              resultPreview: truncate(errMsg, 200),
              success: false,
              toolName: fnName,
            });
            messages.push({
              content: `Tool ${fnName} failed: ${errMsg}`,
              role: "tool",
              toolName: fnName,
            });
          }
        }
        continue;
      }

      // ── Final content (no tool calls) ─────────────────────────────
      finalContent = response.content || "";

      if (!finalContent && iteration < MAX_TOOL_ITERATIONS) {
        writeSSE(stream, {
          type: "reasoning",
          step: "Empty response — retrying…",
        });
        messages.push({
          content: "Please provide your final analysis.",
          role: "user",
        });
        continue;
      }

      // Stream the final content as a single delta
      if (finalContent) {
        writeSSE(stream, { type: "content_delta", delta: finalContent });
      }

      // Extract confidence score
      const confidenceMatch = finalContent.match(
        /confidence[:\s]*([0-9]*\.?[0-9]+)/i,
      );
      if (confidenceMatch) {
        const parsed = Number.parseFloat(confidenceMatch[1]);
        if (parsed >= 0 && parsed <= 1) {
          confidenceScore = parsed;
        } else if (parsed > 1 && parsed <= 100) {
          confidenceScore = parsed / 100;
        }
      }

      break;
    }

    if (!finalContent) {
      finalContent =
        "I was unable to generate a response. Please try rephrasing your question.";
      writeSSE(stream, { type: "content_delta", delta: finalContent });
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    finalContent = `I encountered an error while processing your request: ${errMsg}`;
    reasoningSteps.push(`Error: ${errMsg}`);
    writeSSE(stream, { type: "reasoning", step: `Error: ${errMsg}` });
    writeSSE(stream, { type: "content_delta", delta: finalContent });
  }

  const latencyMs = Date.now() - startTime;

  // ── Save assistant message ──────────────────────────────────────────
  const assistantMessage = msgRepo.create({
    citedSources: citedSources.length > 0 ? citedSources : null,
    confidenceScore,
    content: finalContent,
    conversationId,
    reasoningSteps: reasoningSteps.length > 0 ? reasoningSteps : null,
    role: MessageRole.ASSISTANT,
    sessionId,
    toolsUsed: toolsUsed.length > 0 ? toolsUsed : null,
  });
  const savedMessage = await msgRepo.save(assistantMessage);

  // ── Update conversation ─────────────────────────────────────────────
  await convRepo.increment({ id: conversationId }, "messageCount", 2);

  // ── Log AI interaction ──────────────────────────────────────────────
  await aiLogRepo.save(
    aiLogRepo.create({
      completionTokens: totalCompletionTokens,
      confidenceScore,
      conversationId,
      iterationCount: reasoningSteps.length,
      latencyMs,
      messageId: savedMessage.id,
      model:
        ai.getConfig?.()?.defaultModel || process.env.OLLAMA_MODEL || "unknown",
      promptSent: content,
      promptTokens: totalPromptTokens,
      provider: process.env.AI_PROVIDER || "ollama",
      responseReceived: finalContent,
      sessionId,
      status: AILogStatus.SUCCESS,
      toolCalls:
        toolsUsed.length > 0
          ? toolsUsed.map((t, i) => ({
              durationMs: 0,
              iterationIndex: i,
              parameters: t.parameters,
              resultSummary: t.resultSummary,
              toolName: t.toolName,
            }))
          : null,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      type: AILogType.CHAT,
    }),
  );

  // ── Final "done" event with the saved message ───────────────────────
  writeSSE(stream, {
    type: "done",
    message: {
      citedSources: savedMessage.citedSources,
      confidenceScore: savedMessage.confidenceScore,
      content: savedMessage.content,
      conversationId: savedMessage.conversationId,
      createdAt: savedMessage.createdAt,
      id: savedMessage.id,
      reasoningSteps: savedMessage.reasoningSteps,
      role: savedMessage.role,
      toolsUsed: savedMessage.toolsUsed,
    },
  });

  stream.end();
}
