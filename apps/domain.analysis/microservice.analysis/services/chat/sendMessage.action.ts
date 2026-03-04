/**
 * Send Message Action
 *
 * Core chat action: saves user message, loads system prompt + conversation history,
 * runs AI tool-calling orchestration loop (max 10 iterations), executes tools via
 * ctx.call to microservice.data, saves assistant message with confidence/citations/tools/reasoning,
 * and logs to AILog.
 */

import type { TypedContext } from "core.lib/__generated__";
import type { AIMessageWithTools } from "core.lib/adapters/ai";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { AILog, AILogStatus, AILogType } from "core.lib/database";
import { Errors } from "moleculer";
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
  conversationId: string;
  content: string;
}

export interface SendMessageResult {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  confidenceScore: number | null;
  citedSources: CitedSource[] | null;
  toolsUsed: ToolUsage[] | null;
  reasoningSteps: string[] | null;
  createdAt: Date;
}

const MAX_TOOL_ITERATIONS = 10;

// Build tool config — toggle individual tools on/off here
const toolEnabledConfig = getDefaultToolEnabledConfig();
const TOOL_TO_ACTION = getEnabledToolActions(toolEnabledConfig);

export default defineAction<SendMessageParams, SendMessageResult>({
  rest: "POST /messages",

  params: {
    conversationId: { type: "uuid" },
    content: { type: "string", min: 1, max: 10000 },
  },

  async handler(ctx: TypedContext<SendMessageParams>) {
    const { conversationId, content } = ctx.params;
    const convRepo = dataSource.getRepository(Conversation);
    const msgRepo = dataSource.getRepository(ChatMessage);
    const aiLogRepo = dataSource.getRepository(AILog);

    // Verify conversation exists
    const conversation = await convRepo.findOneBy({ id: conversationId });
    if (!conversation) {
      throw new Errors.MoleculerClientError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
        { id: conversationId },
      );
    }

    const sessionId = conversation.sessionId;
    const { systemPrompt } = await ctx.call("chat.buildDynamicSystemPrompt", {
      sessionId,
    });

    await convRepo.update({ id: conversationId }, { systemPrompt });

    // Save user message
    const userMessage = msgRepo.create({
      conversationId,
      sessionId,
      role: MessageRole.USER,
      content,
    });
    await msgRepo.save(userMessage);

    // Load conversation history
    const history = await msgRepo.find({
      where: { conversationId },
      order: { createdAt: "ASC" },
    });

    // Build message array for AI with dynamically generated system prompt
    const messages: AIMessageWithTools[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...history
        .filter((message) => message.role !== MessageRole.SYSTEM)
        .map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        })),
    ];

    // Build tool definitions (filtered by enabled config)
    const tools = getEnabledToolDefinitions(toolEnabledConfig);

    // Run AI tool-calling orchestration loop
    const ai = createAIAdapter();
    const reasoningSteps: string[] = [];
    const toolsUsed: ToolUsage[] = [];
    const citedSources: CitedSource[] = [];
    let finalContent = "";
    let confidenceScore: number | null = null;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const startTime = Date.now();

    try {
      let iteration = 0;

      while (iteration < MAX_TOOL_ITERATIONS) {
        iteration++;

        const response = await ai.chatWithTools({
          messages,
          tools: iteration <= MAX_TOOL_ITERATIONS - 1 ? tools : [], // No tools on last iteration
        });

        ctx.broker.logger.info(
          `AI response (iteration ${iteration}):`,
          response,
        );

        totalPromptTokens += response.promptTokens || 0;
        totalCompletionTokens += response.completionTokens || 0;

        if (response.toolCalls && response.toolCalls.length > 0) {
          // Add the assistant message (with tool calls) to history so the model
          // sees its own request when processing results on the next iteration.
          messages.push({
            role: "assistant",
            content: response.content || "",
            toolCalls: response.toolCalls,
          });

          // Execute tool calls
          for (const toolCall of response.toolCalls) {
            const fnName = toolCall.function.name;
            const fnArgs = toolCall.function.arguments;
            const actionName = TOOL_TO_ACTION[fnName];

            reasoningSteps.push(
              `Calling tool: ${fnName}(${JSON.stringify(fnArgs)})`,
            );

            if (!actionName) {
              ctx.broker.logger.info(
                `Unknown tool requested: ${fnName} — skipped`,
              );
              reasoningSteps.push(`Unknown tool: ${fnName} — skipped`);
              messages.push({
                role: "tool",
                content: `Tool ${fnName} is not available.`,
                toolName: fnName,
              });
              continue;
            }

            try {
              ctx.broker.logger.info(
                `Calling tool: ${fnName} -> ${actionName}`,
                fnArgs,
              );
              const toolStart = Date.now();
              const result = await (
                ctx as unknown as {
                  call: (
                    name: string,
                    params: Record<string, unknown>,
                  ) => Promise<unknown>;
                }
              ).call(actionName, fnArgs);
              ctx.broker.logger.info(`Tool ${fnName} result:`, result);
              const toolDuration = Date.now() - toolStart;
              ctx.broker.logger.info(
                `Tool ${fnName} completed in ${toolDuration}ms`,
              );

              const resultStr =
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2);

              toolsUsed.push({
                toolName: fnName,
                parameters: fnArgs,
                resultSummary: resultStr,
              });

              reasoningSteps.push(
                `Tool ${fnName} returned (${toolDuration}ms)`,
              );

              // Add tool result to messages as a "tool" role message
              messages.push({
                role: "tool",
                content: resultStr,
                toolName: fnName,
              });

              // Track cited sources from tool parameters
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
              ctx.broker.logger.info(`Tool ${fnName} failed: ${errMsg}`);
              reasoningSteps.push(`Tool ${fnName} failed: ${errMsg}`);
              messages.push({
                role: "tool",
                content: `Tool ${fnName} failed: ${errMsg}`,
                toolName: fnName,
              });
            }
          }

          // Continue loop so AI can process tool results
          continue;
        }

        // No tool calls — this is the final response
        finalContent = response.content || "";

        // Try to extract confidence score from the response
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
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      finalContent = `I encountered an error while processing your request: ${errMsg}`;
      reasoningSteps.push(`Error: ${errMsg}`);
    }

    const latencyMs = Date.now() - startTime;

    // Save assistant message
    const assistantMessage = msgRepo.create({
      conversationId,
      sessionId,
      role: MessageRole.ASSISTANT,
      content: finalContent,
      confidenceScore,
      citedSources: citedSources.length > 0 ? citedSources : null,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : null,
      reasoningSteps: reasoningSteps.length > 0 ? reasoningSteps : null,
    });
    const savedMessage = await msgRepo.save(assistantMessage);

    // Update conversation message count
    await convRepo.increment({ id: conversationId }, "messageCount", 2);

    // Log AI interaction
    await aiLogRepo.save(
      aiLogRepo.create({
        type: AILogType.CHAT,
        sessionId,
        conversationId,
        messageId: savedMessage.id,
        promptSent: content,
        responseReceived: finalContent,
        model:
          ai.getConfig?.()?.defaultModel ||
          process.env.OLLAMA_MODEL ||
          "unknown",
        provider: process.env.AI_PROVIDER || "ollama",
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        latencyMs,
        toolCalls:
          toolsUsed.length > 0
            ? toolsUsed.map((t, i) => ({
                toolName: t.toolName,
                parameters: t.parameters,
                resultSummary: t.resultSummary,
                iterationIndex: i,
                durationMs: 0,
              }))
            : null,
        iterationCount: reasoningSteps.length,
        confidenceScore,
        status: AILogStatus.SUCCESS,
      }),
    );

    return {
      id: savedMessage.id,
      conversationId: savedMessage.conversationId,
      role: savedMessage.role,
      content: savedMessage.content,
      confidenceScore: savedMessage.confidenceScore,
      citedSources: savedMessage.citedSources,
      toolsUsed: savedMessage.toolsUsed,
      reasoningSteps: savedMessage.reasoningSteps,
      createdAt: savedMessage.createdAt,
    };
  },
});
