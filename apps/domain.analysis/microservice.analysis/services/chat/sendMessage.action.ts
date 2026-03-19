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
import { encode as toonEncode } from "@toon-format/toon";
import type { AIMessageWithTools } from "core.lib/adapters/ai";
import { createAIAdapter } from "core.lib/adapters/ai";
import type { AuthenticatedContext } from "core.lib/broker";
import { defineAction } from "core.lib/broker";
import { AILog, AILogStatus, AILogType } from "core.lib/database";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import type {
  CitedSource,
  PromptStats,
  ToolUsage,
} from "../../db/chat-message.entity";
import { ChatMessage, MessageRole } from "../../db/chat-message.entity";
import { Conversation } from "../../db/conversation.entity";
import {
  getDefaultToolEnabledConfig,
  getEnabledToolActions,
  getEnabledToolDefinitions,
  getToolCategory,
  type ToolName,
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
    promptStats: PromptStats | null;
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
const MAX_SUB_AGENT_ITERATIONS = 20;
const toolEnabledConfig = getDefaultToolEnabledConfig();
const TOOL_TO_ACTION = getEnabledToolActions(toolEnabledConfig);

// Sub-agent tool config: all tools enabled except createSubAgent
const subAgentToolConfig = getDefaultToolEnabledConfig();
subAgentToolConfig.createSubAgent = false;
const SUB_AGENT_TOOLS = getEnabledToolDefinitions(subAgentToolConfig);
const SUB_AGENT_TOOL_TO_ACTION = getEnabledToolActions(subAgentToolConfig);

// ── Helpers ─────────────────────────────────────────────────────────────

/** Write a single SSE event frame to the stream. */
function writeSSE(stream: PassThrough, event: StreamEvent): void {
  stream.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

/** Truncate a string to a maximum length, appending "…" if truncated. */
function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

/**
 * Validate that a tool's category matches the dataset type(s) it targets.
 * Returns an error message string if there is a mismatch, or null if OK.
 */
async function validateToolDatasetType(
  fnName: string,
  fnArgs: Record<string, unknown>,
  ctx: {
    call: (name: string, params: Record<string, unknown>) => Promise<unknown>;
  },
): Promise<string | null> {
  const category = getToolCategory(fnName as ToolName);

  // Web and meta tools don't target datasets — skip validation
  if (category === "web" || category === "meta") return null;

  // Collect all dataset IDs referenced by this tool call
  const datasetIds: string[] = [];
  for (const key of ["datasetId", "leftDatasetId", "rightDatasetId"] as const) {
    const value = fnArgs[key];
    if (typeof value === "string" && value.length > 0) {
      datasetIds.push(value);
    }
  }

  // No dataset ID provided — let the tool action handle its own validation
  if (datasetIds.length === 0) return null;

  const expectedType =
    category === "structured" ? "structured-table" : "unstructured-text";

  for (const datasetId of datasetIds) {
    try {
      const dataset = (await ctx.call("dataset.getDataset", {
        id: datasetId,
      })) as { datasetType: string; name: string };

      if (dataset.datasetType !== expectedType) {
        return (
          `Error: Tool "${fnName}" is a ${category} data tool and requires a ${expectedType} dataset, ` +
          `but dataset "${dataset.name}" (${datasetId}) is ${dataset.datasetType}. ` +
          `Please use a ${category === "structured" ? "structured" : "unstructured text"} tool ` +
          `for this dataset type instead.`
        );
      }
    } catch {
      // Dataset lookup failed — let the tool action handle its own error
    }
  }

  return null;
}

// ── TOON serialization ───────────────────────────────────────────────────

/**
 * Serialize a tool result for inclusion in the LLM message history.
 * Non-string values are encoded as TOON (Token-Oriented Object Notation)
 * which is more token-efficient than JSON. Falls back to JSON on failure.
 */
function formatToolResult(result: unknown): string {
  if (typeof result === "string") return result;

  try {
    return toonEncode(result);
  } catch {
    // Encoding failed – fall back to JSON
    return JSON.stringify(result, null, 2);
  }
}

/** Execute a single tool call and return the result string. */
async function executeToolCall(req: {
  ctx: {
    call: (name: string, params: Record<string, unknown>) => Promise<unknown>;
  };
  fnArgs: Record<string, unknown>;
  fnName: string;
  stream: PassThrough;
  toolToAction: Record<string, string>;
}): Promise<{ durationMs: number; error: boolean; result: string }> {
  const { ctx, fnArgs, fnName, stream, toolToAction } = req;
  const actionName = toolToAction[fnName];

  if (!actionName) {
    writeSSE(stream, {
      type: "tool_end",
      durationMs: 0,
      resultPreview: "Tool not available",
      success: false,
      toolName: fnName,
    });
    return {
      durationMs: 0,
      error: true,
      result: `Tool ${fnName} is not available.`,
    };
  }

  const typeMismatchError = await validateToolDatasetType(fnName, fnArgs, ctx);
  if (typeMismatchError) {
    writeSSE(stream, {
      type: "tool_end",
      durationMs: 0,
      resultPreview: truncate(typeMismatchError, 200),
      success: false,
      toolName: fnName,
    });
    return { durationMs: 0, error: true, result: typeMismatchError };
  }

  try {
    const toolStart = Date.now();
    const result = await ctx.call(actionName, fnArgs);
    const durationMs = Date.now() - toolStart;
    const resultStr = formatToolResult(result);

    writeSSE(stream, {
      type: "tool_end",
      durationMs,
      resultPreview: truncate(resultStr, 200),
      success: true,
      toolName: fnName,
    });
    return { durationMs, error: false, result: resultStr };
  } catch (toolErr: unknown) {
    const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
    writeSSE(stream, {
      type: "tool_end",
      durationMs: 0,
      resultPreview: truncate(errMsg, 200),
      success: false,
      toolName: fnName,
    });
    return {
      durationMs: 0,
      error: true,
      result: `Tool ${fnName} failed: ${errMsg}`,
    };
  }
}

// ── Sub-agent orchestration ─────────────────────────────────────────────

/**
 * Run a sub-agent that independently performs an analysis task.
 * The sub-agent has access to all tools except createSubAgent.
 * Returns the sub-agent's final textual answer.
 */
async function runSubAgent(req: {
  ctx: {
    broker: {
      logger: { info: (msg: string) => void; warn: (msg: string) => void };
    };
    call: (name: string, params: Record<string, unknown>) => Promise<unknown>;
  };
  prompt: string;
  stream: PassThrough;
  systemPrompt: string;
}): Promise<{
  completionTokens: number;
  content: string;
  promptTokens: number;
  toolsUsed: ToolUsage[];
}> {
  const { ctx, prompt, stream, systemPrompt } = req;
  const ai = createAIAdapter();
  const toolsUsed: ToolUsage[] = [];

  const messages: AIMessageWithTools[] = [
    { content: systemPrompt, role: "system" },
    { content: prompt, role: "user" },
  ];

  let finalContent = "";
  let contentStreamedViaCallback = false;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  writeSSE(stream, { type: "status", message: "Sub-agent started…" });

  let iteration = 0;
  while (iteration < MAX_SUB_AGENT_ITERATIONS) {
    iteration++;

    writeSSE(stream, {
      type: "reasoning",
      step: `[Sub-agent] Cooking…`,
    });

    const isLastIteration = iteration > MAX_SUB_AGENT_ITERATIONS - 1;

    const response = await ai.chatWithTools({
      messages,
      onContent: (chunk: string) => {
        finalContent += chunk;
        contentStreamedViaCallback = true;
      },
      onReasoning: (chunk: string) => {
        writeSSE(stream, { type: "reasoning", step: `[Sub-agent] ${chunk}` });
      },
      tools: !isLastIteration ? SUB_AGENT_TOOLS : [],
    });

    totalPromptTokens += response.promptTokens || 0;
    totalCompletionTokens += response.completionTokens || 0;

    if (response.toolCalls && response.toolCalls.length > 0) {
      finalContent = "";
      contentStreamedViaCallback = false;

      messages.push({
        _rawAssistantParts: response._rawAssistantParts,
        content: response.content || "",
        role: "assistant",
        toolCalls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        const fnName = toolCall.function.name;
        const fnArgs = toolCall.function.arguments;

        writeSSE(stream, {
          type: "tool_start",
          toolName: fnName,
          parameters: fnArgs,
        });
        writeSSE(stream, {
          type: "reasoning",
          step: `[Sub-agent] Calling tool: ${fnName}`,
        });

        const toolResult = await executeToolCall({
          ctx,
          fnArgs,
          fnName,
          stream,
          toolToAction: SUB_AGENT_TOOL_TO_ACTION,
        });

        if (!toolResult.error) {
          toolsUsed.push({
            parameters: fnArgs,
            resultSummary: toolResult.result,
            toolName: fnName,
          });
          writeSSE(stream, {
            type: "reasoning",
            step: `[Sub-agent] Tool ${fnName} returned (${toolResult.durationMs}ms)`,
          });
        }

        messages.push({
          content: toolResult.result,
          role: "tool",
          toolName: fnName,
        });
      }
      continue;
    }

    // Final content (no tool calls)
    if (!contentStreamedViaCallback) {
      finalContent = response.content || "";
    }

    if (!finalContent && iteration < MAX_SUB_AGENT_ITERATIONS) {
      contentStreamedViaCallback = false;
      messages.push({
        content: "Please provide your final analysis.",
        role: "user",
      });
      continue;
    }

    break;
  }

  writeSSE(stream, { type: "status", message: "Sub-agent finished." });

  return {
    completionTokens: totalCompletionTokens,
    content: finalContent || "Sub-agent was unable to produce a response.",
    promptTokens: totalPromptTokens,
    toolsUsed,
  };
}

// ── Action ──────────────────────────────────────────────────────────────

export default defineAction<SendMessageParams, SendMessageResult>({
  authentication: true,
  rest: "POST /messages",

  params: {
    content: { type: "string", max: 10000, min: 1 },
    conversationId: { type: "uuid" },
  },

  async handler(ctx: AuthenticatedContext<SendMessageParams>) {
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

// ── Conversation preparation ────────────────────────────────────────────

interface ConversationContext {
  conversation: Conversation;
  messages: AIMessageWithTools[];
  sessionId: string;
  systemPrompt: string;
}

/** Verify conversation, build system prompt, save user message, auto-rename, load history. */
async function prepareConversation(req: {
  ctx: AuthenticatedContext<SendMessageParams>;
  stream: PassThrough;
}): Promise<ConversationContext | null> {
  const { ctx, stream } = req;
  const { content, conversationId } = ctx.params;
  const convRepo = dataSource.getRepository(Conversation);
  const msgRepo = dataSource.getRepository(ChatMessage);

  // ── Verify conversation exists ──────────────────────────────────────
  writeSSE(stream, { type: "status", message: "Verifying conversation…" });

  const conversation = await convRepo.findOneBy({ id: conversationId });
  if (!conversation) {
    writeSSE(stream, { type: "error", message: "Conversation not found" });
    stream.end();
    return null;
  }

  // Verify session ownership
  try {
    await ctx.call("session.verifySessionOwnership", {
      sessionId: conversation.sessionId,
      userId: ctx.meta.user.id,
    });
  } catch (err) {
    const isMoleculerClientError =
      err instanceof Error && "code" in err && (err as { code: number }).code === 404;
    if (!isMoleculerClientError) {
      ctx.broker.logger.error("Unexpected error verifying session ownership:", err);
    }
    writeSSE(stream, { type: "error", message: "Conversation not found" });
    stream.end();
    return null;
  }

  const sessionId = conversation.sessionId;

  // ── Build system prompt ─────────────────────────────────────────────
  writeSSE(stream, { type: "status", message: "Building context…" });

  const { systemPrompt } = (await ctx.call("chat.buildDynamicSystemPrompt", {
    sessionId,
  })) as { systemPrompt: string };
  await convRepo.update({ id: conversationId }, { systemPrompt });

  // ── Save user message ───────────────────────────────────────────────
  const userMessage = msgRepo.create({
    content,
    conversationId,
    role: MessageRole.USER,
    sessionId,
  });
  await msgRepo.save(userMessage);

  // ── Auto-rename conversation on first message ───────────────────────
  await autoRenameConversation({
    content,
    conversation,
    conversationId,
    ctx,
    sessionId,
    stream,
  });

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

  return { conversation, messages, sessionId, systemPrompt };
}

/** Auto-rename conversation on the first user message. */
async function autoRenameConversation(req: {
  content: string;
  conversation: Conversation;
  conversationId: string;
  ctx: AuthenticatedContext<SendMessageParams>;
  sessionId: string;
  stream: PassThrough;
}): Promise<void> {
  const { content, conversation, conversationId, ctx, sessionId, stream } = req;
  if (conversation.messageCount !== 0) return;

  try {
    writeSSE(stream, { type: "status", message: "Generating title…" });

    const datasets = (await ctx.call("dataset.listDatasets", {
      sessionId,
    })) as Array<{ datasetType: string; name: string; rowCount: number }>;

    const datasetSummary =
      datasets.length > 0
        ? `\nDatasets in session: ${datasets.map((d) => `${d.name} (${d.datasetType}, ${d.rowCount} rows)`).join(", ")}`
        : "";

    const nameContext = `User question: ${content}${datasetSummary}`;

    const { name } = (await ctx.call(
      "chat.generateName",
      { context: nameContext, target: "conversation" as const },
      { timeout: 600000 },
    )) as { name: string };
    await ctx.call("conversation.renameConversation", {
      id: conversationId,
      name,
    });
    ctx.broker.logger.info(
      `Conversation ${conversationId} auto-renamed to "${name}"`,
    );
  } catch (renameErr: unknown) {
    const msg =
      renameErr instanceof Error ? renameErr.message : String(renameErr);
    ctx.broker.logger.warn(
      `Failed to auto-rename conversation ${conversationId}: ${msg}`,
    );
  }
}

// ── Orchestration types ─────────────────────────────────────────────────

interface OrchestrationResult {
  citedSources: CitedSource[];
  completionTokens: number;
  confidenceScore: number | null;
  finalContent: string;
  latencyMs: number;
  promptTokens: number;
  reasoningSteps: string[];
  toolsUsed: ToolUsage[];
}

// ── Confidence extraction ───────────────────────────────────────────────

function extractConfidenceScore(content: string): number | null {
  const confidenceMatch = content.match(/confidence[:\s]*([0-9]*\.?[0-9]+)/i);
  if (!confidenceMatch) return null;

  const parsed = Number.parseFloat(confidenceMatch[1]);
  if (parsed >= 0 && parsed <= 1) return parsed;
  if (parsed > 1 && parsed <= 100) return parsed / 100;
  return null;
}

// ── Sub-agent tool call handler ─────────────────────────────────────────

async function handleSubAgentCall(req: {
  ctx: AuthenticatedContext<SendMessageParams>;
  fnArgs: Record<string, unknown>;
  fnName: string;
  messages: AIMessageWithTools[];
  reasoningSteps: string[];
  stream: PassThrough;
  toolsUsed: ToolUsage[];
}): Promise<{ completionTokens: number; promptTokens: number }> {
  const { ctx, fnArgs, fnName, messages, reasoningSteps, stream, toolsUsed } =
    req;
  const subAgentPrompt = fnArgs.prompt as string;

  if (!subAgentPrompt) {
    const errMsg = "createSubAgent requires a prompt parameter.";
    reasoningSteps.push(errMsg);
    writeSSE(stream, {
      type: "tool_end",
      durationMs: 0,
      resultPreview: errMsg,
      success: false,
      toolName: fnName,
    });
    messages.push({ content: errMsg, role: "tool", toolName: fnName });
    return { completionTokens: 0, promptTokens: 0 };
  }

  try {
    const subStart = Date.now();
    const subResult = await runSubAgent({
      ctx: ctx as unknown as {
        broker: {
          logger: {
            info: (msg: string) => void;
            warn: (msg: string) => void;
          };
        };
        call: (
          name: string,
          params: Record<string, unknown>,
        ) => Promise<unknown>;
      },
      prompt: subAgentPrompt,
      stream,
      systemPrompt: messages.find((m) => m.role === "system")?.content || "",
    });
    const subDuration = Date.now() - subStart;

    toolsUsed.push(...subResult.toolsUsed);

    const stepResult = `Sub-agent finished (${subDuration}ms)`;
    reasoningSteps.push(stepResult);
    writeSSE(stream, { type: "reasoning", step: stepResult });
    writeSSE(stream, {
      type: "tool_end",
      durationMs: subDuration,
      resultPreview: truncate(subResult.content, 200),
      success: true,
      toolName: fnName,
    });
    messages.push({
      content: subResult.content,
      role: "tool",
      toolName: fnName,
    });

    return {
      completionTokens: subResult.completionTokens,
      promptTokens: subResult.promptTokens,
    };
  } catch (subErr: unknown) {
    const errMsg = subErr instanceof Error ? subErr.message : String(subErr);
    const stepFail = `Sub-agent failed: ${errMsg}`;
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
      content: `Sub-agent failed: ${errMsg}`,
      role: "tool",
      toolName: fnName,
    });
    return { completionTokens: 0, promptTokens: 0 };
  }
}

// ── Normal tool call handler (main agent) ───────────────────────────────

async function handleNormalToolInLoop(req: {
  citedSources: CitedSource[];
  ctx: AuthenticatedContext<SendMessageParams>;
  fnArgs: Record<string, unknown>;
  fnName: string;
  messages: AIMessageWithTools[];
  reasoningSteps: string[];
  stream: PassThrough;
  toolsUsed: ToolUsage[];
}): Promise<void> {
  const {
    citedSources,
    ctx,
    fnArgs,
    fnName,
    messages,
    reasoningSteps,
    stream,
    toolsUsed,
  } = req;
  const actionName = TOOL_TO_ACTION[fnName];

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
    return;
  }

  // ── Dataset type validation ──────────────────────────────────────
  const typeMismatchError = await validateToolDatasetType(
    fnName,
    fnArgs,
    ctx as unknown as {
      call: (name: string, params: Record<string, unknown>) => Promise<unknown>;
    },
  );
  if (typeMismatchError) {
    reasoningSteps.push(typeMismatchError);
    writeSSE(stream, {
      type: "tool_end",
      durationMs: 0,
      resultPreview: truncate(typeMismatchError, 200),
      success: false,
      toolName: fnName,
    });
    messages.push({
      content: typeMismatchError,
      role: "tool",
      toolName: fnName,
    });
    return;
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

    const resultStr = formatToolResult(result);

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

    messages.push({ content: resultStr, role: "tool", toolName: fnName });

    // Track cited sources
    if (fnArgs.datasetId) {
      const existing = citedSources.find(
        (s) => s.datasetId === fnArgs.datasetId,
      );
      if (!existing) {
        citedSources.push({
          datasetId: fnArgs.datasetId as string,
          datasetName: (fnArgs.datasetName as string) || "Unknown Dataset",
          columnName: fnArgs.field as string | undefined,
        });
      }
    }
  } catch (toolErr: unknown) {
    const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
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

// ── AI orchestration loop ───────────────────────────────────────────────

async function runOrchestrationLoop(req: {
  ctx: AuthenticatedContext<SendMessageParams>;
  messages: AIMessageWithTools[];
  stream: PassThrough;
}): Promise<OrchestrationResult> {
  const { ctx, messages, stream } = req;
  const tools = getEnabledToolDefinitions(toolEnabledConfig);
  const ai = createAIAdapter();

  const reasoningSteps: string[] = [];
  const toolsUsed: ToolUsage[] = [];
  const citedSources: CitedSource[] = [];
  let finalContent = "";
  let contentStreamedViaCallback = false;
  let confidenceScore: number | null = null;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const startTime = Date.now();

  writeSSE(stream, { type: "status", message: "Thinking…" });

  try {
    let iteration = 0;

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      writeSSE(stream, { type: "reasoning", step: "Cooking..." });

      const isLastIteration = iteration > MAX_TOOL_ITERATIONS - 1;

      const response = await ai.chatWithTools({
        messages,
        onContent: (chunk: string) => {
          finalContent += chunk;
          contentStreamedViaCallback = true;
          writeSSE(stream, { type: "content_delta", delta: chunk });
        },
        onReasoning: (chunk: string) => {
          reasoningSteps.push(chunk);
          writeSSE(stream, { type: "reasoning", step: chunk });
        },
        tools: !isLastIteration ? tools : [],
      });

      totalPromptTokens += response.promptTokens || 0;
      totalCompletionTokens += response.completionTokens || 0;

      // ── Tool calls ────────────────────────────────────────────────
      if (response.toolCalls && response.toolCalls.length > 0) {
        finalContent = "";
        contentStreamedViaCallback = false;

        messages.push({
          _rawAssistantParts: response._rawAssistantParts,
          content: response.content || "",
          role: "assistant",
          toolCalls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          const fnName = toolCall.function.name;
          const fnArgs = toolCall.function.arguments;

          const stepDesc = `Calling tool: ${fnName}(${JSON.stringify(fnArgs)})`;
          reasoningSteps.push(stepDesc);
          writeSSE(stream, { type: "reasoning", step: stepDesc });
          writeSSE(stream, {
            type: "tool_start",
            toolName: fnName,
            parameters: fnArgs,
          });

          if (fnName === "createSubAgent") {
            const tokens = await handleSubAgentCall({
              ctx,
              fnArgs,
              fnName,
              messages,
              reasoningSteps,
              stream,
              toolsUsed,
            });
            totalPromptTokens += tokens.promptTokens;
            totalCompletionTokens += tokens.completionTokens;
            continue;
          }

          await handleNormalToolInLoop({
            citedSources,
            ctx,
            fnArgs,
            fnName,
            messages,
            reasoningSteps,
            stream,
            toolsUsed,
          });
        }

        // ── Self-reflection: prompt the AI to verify data relevance ──
        messages.push({
          content:
            "Before responding, reflect on the data you just retrieved:\n" +
            "1. Is this data sufficient to answer the user's question?\n" +
            "2. Is the retrieved information relevant and accurate?\n" +
            "3. Do you need to fetch additional data from other sections or datasets?\n" +
            "If the data is insufficient or irrelevant, use more tools to gather better information. " +
            "If the data is sufficient, provide your final answer.",
          role: "system",
        });

        writeSSE(stream, {
          type: "reasoning",
          step: "Self-reflection: verifying data relevance…",
        });
        reasoningSteps.push("Self-reflection: verifying data relevance…");

        continue;
      }

      // ── Final content (no tool calls) ─────────────────────────────
      if (!contentStreamedViaCallback) {
        finalContent = response.content || "";
      }

      if (!finalContent && iteration < MAX_TOOL_ITERATIONS) {
        contentStreamedViaCallback = false;
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

      if (finalContent && !contentStreamedViaCallback) {
        writeSSE(stream, { type: "content_delta", delta: finalContent });
      }

      confidenceScore = extractConfidenceScore(finalContent);
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

  return {
    citedSources,
    completionTokens: totalCompletionTokens,
    confidenceScore,
    finalContent,
    latencyMs: Date.now() - startTime,
    promptTokens: totalPromptTokens,
    reasoningSteps,
    toolsUsed,
  };
}

// ── Save results & finalize stream ──────────────────────────────────────

async function saveAndFinalize(req: {
  content: string;
  conversationId: string;
  result: OrchestrationResult;
  sessionId: string;
  stream: PassThrough;
}): Promise<void> {
  const { content, conversationId, result, sessionId, stream } = req;
  const convRepo = dataSource.getRepository(Conversation);
  const msgRepo = dataSource.getRepository(ChatMessage);
  const aiLogRepo = dataSource.getRepository(AILog);
  const ai = createAIAdapter();

  const promptStats: PromptStats | null =
    result.promptTokens > 0 || result.completionTokens > 0
      ? {
          completionTokens: result.completionTokens,
          latencyMs: result.latencyMs,
          promptTokens: result.promptTokens,
          totalTokens: result.promptTokens + result.completionTokens,
        }
      : null;

  const assistantMessage = msgRepo.create({
    citedSources: result.citedSources.length > 0 ? result.citedSources : null,
    confidenceScore: result.confidenceScore,
    content: result.finalContent,
    conversationId,
    promptStats,
    reasoningSteps:
      result.reasoningSteps.length > 0 ? result.reasoningSteps : null,
    role: MessageRole.ASSISTANT,
    sessionId,
    toolsUsed: result.toolsUsed.length > 0 ? result.toolsUsed : null,
  });
  const savedMessage = await msgRepo.save(assistantMessage);

  await convRepo.increment({ id: conversationId }, "messageCount", 2);

  await aiLogRepo.save(
    aiLogRepo.create({
      completionTokens: result.completionTokens,
      confidenceScore: result.confidenceScore,
      conversationId,
      iterationCount: result.reasoningSteps.length,
      latencyMs: result.latencyMs,
      messageId: savedMessage.id,
      model:
        ai.getConfig?.()?.defaultModel || process.env.OLLAMA_MODEL || "unknown",
      promptSent: content,
      promptTokens: result.promptTokens,
      provider: process.env.AI_PROVIDER || "ollama",
      responseReceived: result.finalContent,
      sessionId,
      status: AILogStatus.SUCCESS,
      toolCalls:
        result.toolsUsed.length > 0
          ? result.toolsUsed.map((t, i) => ({
              durationMs: 0,
              iterationIndex: i,
              parameters: t.parameters,
              resultSummary: t.resultSummary,
              toolName: t.toolName,
            }))
          : null,
      totalTokens: result.promptTokens + result.completionTokens,
      type: AILogType.CHAT,
    }),
  );

  writeSSE(stream, {
    type: "done",
    message: {
      citedSources: savedMessage.citedSources,
      confidenceScore: savedMessage.confidenceScore,
      content: savedMessage.content,
      conversationId: savedMessage.conversationId,
      createdAt: savedMessage.createdAt,
      id: savedMessage.id,
      promptStats: savedMessage.promptStats,
      reasoningSteps: savedMessage.reasoningSteps,
      role: savedMessage.role,
      toolsUsed: savedMessage.toolsUsed,
    },
  });

  stream.end();
}

// ── Orchestration entry point (runs asynchronously) ─────────────────────

async function processStream(
  ctx: AuthenticatedContext<SendMessageParams>,
  stream: PassThrough,
): Promise<void> {
  const prepared = await prepareConversation({ ctx, stream });
  if (!prepared) return;

  const { messages, sessionId } = prepared;

  const result = await runOrchestrationLoop({ ctx, messages, stream });

  await saveAndFinalize({
    content: ctx.params.content,
    conversationId: ctx.params.conversationId,
    result,
    sessionId,
    stream,
  });
}
