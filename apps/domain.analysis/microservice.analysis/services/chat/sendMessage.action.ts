/**
 * Send Message Action
 *
 * Core chat action: saves user message, loads system prompt + conversation history,
 * runs AI tool-calling orchestration loop (max 10 iterations), executes tools via
 * ctx.call to microservice.data, saves assistant message with confidence/citations/tools/reasoning,
 * and logs to AILog.
 */

import type { TypedContext } from "core.lib/__generated__";
import type { AIMessageWithTools, ToolDefinition } from "core.lib/adapters/ai";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { AILog, AILogStatus, AILogType } from "core.lib/database";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import type { CitedSource, ToolUsage } from "../../db/chat-message.entity";
import { ChatMessage, MessageRole } from "../../db/chat-message.entity";
import { Conversation } from "../../db/conversation.entity";

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

// Map tool names to Moleculer service actions
const TOOL_TO_ACTION: Record<string, string> = {
  aggregate: "tools.aggregate",
  sumField: "tools.sumField",
  avgField: "tools.avgField",
  count: "tools.count",
  getTopByField: "tools.getTopByField",
  countAndGroup: "tools.countAndGroup",
  getDistinctValues: "tools.getDistinctValues",
  filterByCondition: "tools.filterByCondition",
  getMinMax: "tools.getMinMax",
  correlateFields: "tools.correlateFields",
  pivotTable: "tools.pivotTable",
  joinDatasets: "tools.joinDatasets",
  getPercentile: "tools.getPercentile",
  detectOutliers: "tools.detectOutliers",
  sortByField: "tools.sortByField",
  semanticSearch: "tools.semanticSearch",
  summarizeDocument: "tools.summarizeDocument",
  extractKeyTopics: "tools.extractKeyTopics",
  extractEntities: "tools.extractEntities",
  answerFromContext: "tools.answerFromContext",
  compareDocuments: "tools.compareDocuments",
  findSimilarChunks: "tools.findSimilarChunks",
  timelineExtraction: "tools.timelineExtraction",
  sentimentAnalysis: "tools.sentimentAnalysis",
};

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

    // Build message array for AI
    const messages: AIMessageWithTools[] = history.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));

    // Build tool definitions
    const tools = buildToolDefinitions();

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
              const result = await (ctx as any).call(actionName, fnArgs);
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

function buildToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "sumField",
        description:
          "[STRUCTURED DATA ONLY] Sum a numeric field in a structured-table dataset with optional groupBy. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: { type: "string", description: "Column key to sum" },
            groupBy: {
              type: "string",
              description: "Optional column to group by",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "avgField",
        description:
          "[STRUCTURED DATA ONLY] Average a numeric field in a structured-table dataset with optional groupBy. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: { type: "string", description: "Column key to average" },
            groupBy: {
              type: "string",
              description: "Optional column to group by",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "count",
        description:
          "[STRUCTURED DATA ONLY] Count records in a structured-table dataset with optional filter conditions. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            filters: {
              type: "object",
              description: "Filter conditions as key-value pairs",
            },
          },
          required: ["datasetId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getTopByField",
        description:
          "[STRUCTURED DATA ONLY] Get top N records sorted by a field in a structured-table dataset. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: { type: "string", description: "Column key to sort by" },
            limit: {
              type: "number",
              description: "Number of records (default: 10)",
            },
            order: {
              type: "string",
              description: "ASC or DESC (default: DESC)",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "countAndGroup",
        description:
          "[STRUCTURED DATA ONLY] Count records grouped by one or more fields in a structured-table dataset. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            fields: {
              type: "array",
              items: { type: "string" },
              description: "Column keys to group by",
            },
          },
          required: ["datasetId", "fields"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getDistinctValues",
        description:
          "[STRUCTURED DATA ONLY] Get distinct values with counts for a field in a structured-table dataset. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: { type: "string", description: "Column key" },
          },
          required: ["datasetId", "field"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "filterByCondition",
        description:
          "[STRUCTURED DATA ONLY] Filter records in a structured-table dataset by conditions (equals, range, contains, in). Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            conditions: {
              type: "array",
              description:
                "Array of condition objects. Each object must have field, operator, and value.",
              items: {
                type: "object",
                properties: {
                  field: {
                    type: "string",
                    description: "Column key to filter on",
                  },
                  operator: {
                    type: "string",
                    enum: [
                      "eq",
                      "neq",
                      "gt",
                      "gte",
                      "lt",
                      "lte",
                      "contains",
                      "in",
                    ],
                    description:
                      "Comparison operator: eq (equals), neq (not equals), gt, gte, lt, lte, contains (substring match), in (value in list)",
                  },
                  value: {
                    type: "string",
                    description:
                      "Value to compare against. Use string for eq/neq/contains, number string for gt/gte/lt/lte, or JSON array string for in.",
                  },
                },
                required: ["field", "operator", "value"],
              },
            },
            limit: {
              type: "number",
              description: "Max results (default: 100)",
            },
          },
          required: ["datasetId", "conditions"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getMinMax",
        description:
          "[STRUCTURED DATA ONLY] Get min and max values for a field in a structured-table dataset. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: { type: "string", description: "Column key" },
          },
          required: ["datasetId", "field"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "correlateFields",
        description:
          "[STRUCTURED DATA ONLY] Calculate Pearson correlation between two numeric fields in a structured-table dataset. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field1: { type: "string", description: "First numeric column" },
            field2: { type: "string", description: "Second numeric column" },
          },
          required: ["datasetId", "field1", "field2"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "aggregate",
        description:
          "[STRUCTURED DATA ONLY] Multi-field aggregation pipeline for structured-table datasets. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            aggregations: {
              type: "array",
              description:
                "Array of aggregation objects. Each must have field and operation.",
              items: {
                type: "object",
                properties: {
                  field: {
                    type: "string",
                    description: "Column key to aggregate",
                  },
                  operation: {
                    type: "string",
                    enum: ["sum", "avg", "min", "max", "count"],
                    description: "Aggregation operation to apply",
                  },
                },
                required: ["field", "operation"],
              },
            },
            groupBy: {
              type: "array",
              items: { type: "string" },
              description: "Fields to group by",
            },
            filters: {
              type: "object",
              description: "Optional filter conditions as key-value pairs",
            },
          },
          required: ["datasetId", "aggregations"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "semanticSearch",
        description:
          "[UNSTRUCTURED TEXT ONLY] Search text chunks by semantic similarity using vector embeddings. Only works on unstructured-text datasets. Do NOT use on structured-table datasets. Requires at least one of sessionId or datasetId (or both).",
        parameters: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description:
                "Session UUID for scope (optional if datasetId provided)",
            },
            query: { type: "string", description: "Search query text" },
            topK: {
              type: "number",
              description: "Number of results (default: 5)",
            },
            datasetId: {
              type: "string",
              description:
                "Dataset UUID to scope search (optional if sessionId provided)",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "summarizeDocument",
        description:
          "[UNSTRUCTURED TEXT ONLY] Generate an AI summary of an unstructured-text dataset. Do NOT use on structured-table datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            maxChunks: {
              type: "number",
              description:
                "Maximum number of text chunks to include (default: 20, max: 50)",
            },
          },
          required: ["datasetId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "extractKeyTopics",
        description:
          "[UNSTRUCTURED TEXT ONLY] Extract main topics from an unstructured-text dataset. Do NOT use on structured-table datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            maxTopics: {
              type: "number",
              description:
                "Maximum number of topics to extract (default: 10, max: 20)",
            },
          },
          required: ["datasetId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "extractEntities",
        description:
          "[UNSTRUCTURED TEXT ONLY] Extract entities (people, orgs, dates, locations, monetary) from an unstructured-text dataset. Do NOT use on structured-table datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            entityTypes: {
              type: "array",
              items: { type: "string" },
              description:
                "Entity types to extract (default: person, organization, date, location, monetary)",
            },
          },
          required: ["datasetId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "answerFromContext",
        description:
          "[UNSTRUCTURED TEXT ONLY] Answer a question using retrieved text context via vector search on unstructured-text datasets. Do NOT use on structured-table datasets.",
        parameters: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "Session UUID" },
            question: { type: "string", description: "The question to answer" },
            topK: {
              type: "number",
              description: "Context chunks to retrieve (default: 5)",
            },
            datasetId: {
              type: "string",
              description: "Optional dataset UUID to scope the search",
            },
          },
          required: ["sessionId", "question"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "pivotTable",
        description:
          "[STRUCTURED DATA ONLY] Create a pivot table (cross-tabulation) from a structured-table dataset. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            rowField: {
              type: "string",
              description: "Column key for pivot rows",
            },
            columnField: {
              type: "string",
              description: "Column key for pivot columns",
            },
            valueField: {
              type: "string",
              description: "Column key for values to aggregate",
            },
            aggregation: {
              type: "string",
              enum: ["sum", "avg", "count", "min", "max"],
              description: "Aggregation function (default: sum)",
            },
          },
          required: ["datasetId", "rowField", "columnField", "valueField"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "joinDatasets",
        description:
          "[STRUCTURED DATA ONLY] Join two structured-table datasets on matching fields. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            leftDatasetId: {
              type: "string",
              description: "Left dataset UUID",
            },
            rightDatasetId: {
              type: "string",
              description: "Right dataset UUID",
            },
            leftField: {
              type: "string",
              description: "Join key in left dataset",
            },
            rightField: {
              type: "string",
              description: "Join key in right dataset",
            },
            joinType: {
              type: "string",
              enum: ["inner", "left", "right"],
              description: "Type of join (default: inner)",
            },
            limit: {
              type: "number",
              description: "Max results (default: 100, max: 500)",
            },
          },
          required: [
            "leftDatasetId",
            "rightDatasetId",
            "leftField",
            "rightField",
          ],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getPercentile",
        description:
          "[STRUCTURED DATA ONLY] Calculate percentile values for a numeric field in a structured-table dataset. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: {
              type: "string",
              description: "Numeric column key",
            },
            percentiles: {
              type: "array",
              items: { type: "number" },
              description:
                "Percentile values 0-100 to compute (default: [25,50,75,90,95,99])",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "detectOutliers",
        description:
          "[STRUCTURED DATA ONLY] Detect outliers in a numeric field of a structured-table dataset using IQR or z-score method. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: {
              type: "string",
              description: "Numeric column key",
            },
            method: {
              type: "string",
              enum: ["iqr", "zscore"],
              description: "Detection method (default: iqr)",
            },
            threshold: {
              type: "number",
              description:
                "Sensitivity threshold (default: 1.5 for IQR, 3 for z-score)",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "sortByField",
        description:
          "[STRUCTURED DATA ONLY] Sort and return records from a structured-table dataset by a specified field. Do NOT use on unstructured-text datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            field: {
              type: "string",
              description: "Column key to sort by",
            },
            order: {
              type: "string",
              enum: ["ASC", "DESC"],
              description: "Sort direction (default: ASC)",
            },
            limit: {
              type: "number",
              description: "Max results (default: 100, max: 500)",
            },
            numeric: {
              type: "boolean",
              description:
                "Treat field as numeric for sorting (auto-detected if omitted)",
            },
          },
          required: ["datasetId", "field"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "compareDocuments",
        description:
          "[UNSTRUCTURED TEXT ONLY] Compare two unstructured-text datasets for similarities and differences. Do NOT use on structured-table datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId1: {
              type: "string",
              description: "First dataset UUID",
            },
            datasetId2: {
              type: "string",
              description: "Second dataset UUID",
            },
          },
          required: ["datasetId1", "datasetId2"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "findSimilarChunks",
        description:
          "[UNSTRUCTURED TEXT ONLY] Find text chunks similar to a given chunk using vector embeddings. Only works on unstructured-text datasets. Do NOT use on structured-table datasets.",
        parameters: {
          type: "object",
          properties: {
            chunkId: {
              type: "string",
              description: "Source text chunk UUID",
            },
            topK: {
              type: "number",
              description: "Number of similar chunks to return (default: 5)",
            },
            sessionId: {
              type: "string",
              description:
                "Optional session UUID to scope search (defaults to source chunk's session)",
            },
          },
          required: ["chunkId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "timelineExtraction",
        description:
          "[UNSTRUCTURED TEXT ONLY] Extract temporal events and dates from an unstructured-text dataset. Do NOT use on structured-table datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
          },
          required: ["datasetId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "sentimentAnalysis",
        description:
          "[UNSTRUCTURED TEXT ONLY] Analyze sentiment of text content from an unstructured-text dataset. Do NOT use on structured-table datasets.",
        parameters: {
          type: "object",
          properties: {
            datasetId: { type: "string", description: "Dataset UUID" },
            granularity: {
              type: "string",
              enum: ["document", "chunk"],
              description:
                "Analyze at document level or per-chunk (default: document)",
            },
          },
          required: ["datasetId"],
        },
      },
    },
  ];
}
