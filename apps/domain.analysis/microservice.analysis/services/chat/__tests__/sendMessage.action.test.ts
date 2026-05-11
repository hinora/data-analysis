/**
 * Tests for chat/sendMessage.action.ts
 *
 * Tests the SSE streaming chat action including:
 * - Basic message flow (conversation not found, simple response)
 * - Tool-calling orchestration loop
 * - Sub-agent delegation
 * - Dataset type validation
 * - Confidence score extraction
 * - Auto-rename on first message
 * - Error handling
 * - AILog creation
 */

import { PassThrough } from "node:stream";
import { AILog } from "core.lib/database";
import {
  aiDefaults,
  clearTestDatabase,
  createMockAIAdapter,
  createTestDataSource,
  destroyTestDataSource,
} from "core.lib/testing";
import type { DataSource } from "typeorm";
import { ChatMessage, MessageRole } from "../../../db/chat-message.entity";
import { Conversation } from "../../../db/conversation.entity";
import { Session, SessionStatus } from "../../../db/session.entity";

// ── Mocks ─────────────────────────────────────────────────────────────

const mockAI = createMockAIAdapter();

jest.mock("core.lib/adapters/ai", () => ({
  createAIAdapter: () => mockAI,
}));

jest.mock("@toon-format/toon", () => ({
  encode: jest.fn((val: unknown) => JSON.stringify(val)),
}));

let testDs: DataSource;

jest.mock("../../../db", () => ({
  get dataSource() {
    return testDs;
  },
  ChatMessage,
  Conversation,
  MessageRole,
  Session,
}));

// Must import toolConfig BEFORE importing the action so the mock is in place
jest.mock("../../../toolConfig", () => {
  const original = jest.requireActual("../../../toolConfig");
  return {
    ...original,
    getDefaultToolEnabledConfig: original.getDefaultToolEnabledConfig,
    getEnabledToolActions: original.getEnabledToolActions,
    getEnabledToolDefinitions: original.getEnabledToolDefinitions,
    getToolCategory: original.getToolCategory,
  };
});

import sendMessageAction from "../sendMessage.action";

// ── Constants ─────────────────────────────────────────────────────────

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";

const entities = [Session, Conversation, ChatMessage, AILog];

// ── Lifecycle ─────────────────────────────────────────────────────────

beforeAll(async () => {
  testDs = await createTestDataSource(entities);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, entities);
  jest.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────

/** Collect all SSE events from the PassThrough stream until it closes. */
function collectSSEEvents(
  stream: PassThrough,
): Promise<Array<{ data: string; type: string }>> {
  return new Promise((resolve) => {
    const events: Array<{ data: string; type: string }> = [];
    let buffer = "";

    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const frames = buffer.split("\n\n");
      // Keep the last (possibly incomplete) frame in the buffer
      buffer = frames.pop() || "";

      for (const frame of frames) {
        const typeMatch = frame.match(/^event: (.+)$/m);
        const dataMatch = frame.match(/^data: (.+)$/m);
        if (typeMatch && dataMatch) {
          events.push({ type: typeMatch[1], data: dataMatch[1] });
        }
      }
    });

    stream.on("end", () => {
      // Process any remaining buffer
      if (buffer.trim()) {
        const typeMatch = buffer.match(/^event: (.+)$/m);
        const dataMatch = buffer.match(/^data: (.+)$/m);
        if (typeMatch && dataMatch) {
          events.push({ type: typeMatch[1], data: dataMatch[1] });
        }
      }
      resolve(events);
    });
  });
}

/** Parse SSE events into typed objects. */
function parseSSEEvents(events: Array<{ data: string; type: string }>) {
  return events.map((e) => ({
    type: e.type,
    payload: JSON.parse(e.data),
  }));
}

/** Seed a session + conversation. */
async function seedConversation(opts?: {
  messageCount?: number;
  existingMessages?: Array<{
    content: string;
    role: MessageRole;
  }>;
}) {
  const sessionRepo = testDs.getRepository(Session);
  const convRepo = testDs.getRepository(Conversation);
  const msgRepo = testDs.getRepository(ChatMessage);

  await sessionRepo.save(
    sessionRepo.create({
      id: SESSION_ID,
      name: "Test Session",
      status: SessionStatus.ACTIVE,
      datasetCount: 0,
      conversationCount: 1,
    }),
  );

  await convRepo.save(
    convRepo.create({
      id: CONVERSATION_ID,
      sessionId: SESSION_ID,
      name: "Test Conversation",
      systemPrompt: "You are a helpful assistant.",
      messageCount: opts?.messageCount ?? 1,
    }),
  );

  if (opts?.existingMessages) {
    for (const msg of opts.existingMessages) {
      await msgRepo.save(
        msgRepo.create({
          conversationId: CONVERSATION_ID,
          sessionId: SESSION_ID,
          role: msg.role,
          content: msg.content,
        }),
      );
    }
  }
}

/** Create a mock context for the sendMessage action. */
function createCtx(params: { content: string; conversationId: string }) {
  // biome-ignore lint/suspicious/noExplicitAny: test stubs
  const callStubs: Record<string, any> = {};

  const callMock = jest.fn(async (actionName: string, ...args: unknown[]) => {
    const stub = callStubs[actionName];
    if (stub) {
      return typeof stub === "function" ? stub(...args) : stub;
    }
    throw new Error(`Unmocked ctx.call("${actionName}"). Add it to callStubs.`);
  });

  const ctx = {
    params,
    meta: {} as Record<string, unknown>,
    call: callMock,
    emit: jest.fn(),
    broadcast: jest.fn(),
    broker: {
      logger: {
        debug: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn(),
        info: jest.fn(),
        trace: jest.fn(),
        warn: jest.fn(),
      },
    },
  };

  return { callMock, callStubs, ctx };
}

/** Register standard call stubs for a basic flow. */
function registerBasicStubs(callStubs: Record<string, unknown>) {
  callStubs["chat.buildDynamicSystemPrompt"] = {
    systemPrompt: "You are a test assistant.",
  };
  callStubs["dataset.listDatasets"] = [];
  callStubs["chat.generateName"] = { name: "Generated Title" };
  callStubs["conversation.renameConversation"] = { success: true };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("chat.sendMessage action", () => {
  describe("handler", () => {
    it("should return a PassThrough stream with SSE response headers", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Hello",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Hi there!",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);

      expect(result).toBeInstanceOf(PassThrough);
      expect(ctx.meta.$responseType).toBe("text/event-stream");
      expect(ctx.meta.$responseHeaders).toEqual({
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // Let the async processStream finish
      const events = await collectSSEEvents(result);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("conversation not found", () => {
    it("should emit error event when conversation does not exist", async () => {
      const { ctx } = createCtx({
        content: "Hello",
        conversationId: "00000000-0000-4000-8000-000000000000",
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const errorEvent = parsed.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.payload.message).toBe("Conversation not found");
    });
  });

  describe("simple response (no tool calls)", () => {
    it("should save user message, get AI response, save assistant message, and emit done", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "What is 2+2?",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "The answer is 4.",
        toolCalls: [],
        promptTokens: 50,
        completionTokens: 20,
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      // Should have a done event with the saved message
      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.payload.message.content).toBe("The answer is 4.");
      expect(doneEvent!.payload.message.role).toBe("assistant");
      expect(doneEvent!.payload.message.conversationId).toBe(CONVERSATION_ID);

      // Verify content_delta was emitted
      const contentDelta = parsed.find((e) => e.type === "content_delta");
      expect(contentDelta).toBeDefined();
      expect(contentDelta!.payload.delta).toBe("The answer is 4.");

      // Verify user message was saved
      const messages = await testDs.getRepository(ChatMessage).find({
        order: { createdAt: "ASC" },
        where: { conversationId: CONVERSATION_ID },
      });
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe(MessageRole.USER);
      expect(messages[0].content).toBe("What is 2+2?");
      expect(messages[1].role).toBe(MessageRole.ASSISTANT);
      expect(messages[1].content).toBe("The answer is 4.");

      // Verify prompt stats were saved
      expect(messages[1].promptStats).toEqual(
        expect.objectContaining({
          promptTokens: 50,
          completionTokens: 20,
          totalTokens: 70,
        }),
      );
    });

    it("should emit content via streaming callback (onContent)", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Hello",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      // Simulate streaming: chatWithTools calls onContent
      mockAI.chatWithTools.mockImplementationOnce(async (params) => {
        if (params.onContent) {
          params.onContent("Hello ");
          params.onContent("world!");
        }
        return {
          ...aiDefaults.chatWithToolsResult,
          content: "",
          toolCalls: [],
          promptTokens: 10,
          completionTokens: 5,
        };
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      // Content should have been streamed via content_delta events
      const contentDeltas = parsed.filter((e) => e.type === "content_delta");
      expect(contentDeltas).toHaveLength(2);
      expect(contentDeltas[0].payload.delta).toBe("Hello ");
      expect(contentDeltas[1].payload.delta).toBe("world!");

      // Done message should have combined content
      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.content).toBe("Hello world!");
    });
  });

  describe("auto-rename on first message", () => {
    it("should auto-rename conversation when messageCount is 0", async () => {
      await seedConversation({ messageCount: 0 });
      const { callStubs, ctx } = createCtx({
        content: "Analyze sales data",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Analysis complete.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      await collectSSEEvents(result);

      // Should have called generateName and renameConversation
      expect(ctx.call).toHaveBeenCalledWith(
        "chat.generateName",
        expect.objectContaining({
          context: expect.stringContaining("Analyze sales data"),
          target: "conversation",
        }),
        expect.objectContaining({ timeout: 600000 }),
      );
      expect(ctx.call).toHaveBeenCalledWith(
        "conversation.renameConversation",
        expect.objectContaining({
          id: CONVERSATION_ID,
          name: "Generated Title",
        }),
      );
    });

    it("should not auto-rename when messageCount > 0", async () => {
      await seedConversation({ messageCount: 5 });
      const { callStubs, ctx } = createCtx({
        content: "Follow up question",
        conversationId: CONVERSATION_ID,
      });
      callStubs["chat.buildDynamicSystemPrompt"] = {
        systemPrompt: "You are a test assistant.",
      };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Response.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      await collectSSEEvents(result);

      expect(ctx.call).not.toHaveBeenCalledWith(
        "chat.generateName",
        expect.anything(),
        expect.anything(),
      );
    });

    it("should handle auto-rename failure gracefully", async () => {
      await seedConversation({ messageCount: 0 });
      const { callStubs, ctx } = createCtx({
        content: "Hello",
        conversationId: CONVERSATION_ID,
      });
      callStubs["chat.buildDynamicSystemPrompt"] = {
        systemPrompt: "You are a test assistant.",
      };
      callStubs["dataset.listDatasets"] = [];
      callStubs["chat.generateName"] = () => {
        throw new Error("AI unavailable");
      };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Response despite rename failure.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      // Should still complete with a done event
      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.payload.message.content).toBe(
        "Response despite rename failure.",
      );

      // Should have logged a warning
      expect(ctx.broker.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to auto-rename"),
      );
    });

    it("should include dataset summary in rename context", async () => {
      await seedConversation({ messageCount: 0 });
      const { callStubs, ctx } = createCtx({
        content: "Analyze this",
        conversationId: CONVERSATION_ID,
      });
      callStubs["chat.buildDynamicSystemPrompt"] = {
        systemPrompt: "You are a test assistant.",
      };
      callStubs["dataset.listDatasets"] = [
        {
          name: "sales.csv",
          datasetType: "structured-table",
          rowCount: 100,
        },
      ];
      callStubs["chat.generateName"] = { name: "Sales Analysis" };
      callStubs["conversation.renameConversation"] = { success: true };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Done.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      await collectSSEEvents(result);

      expect(ctx.call).toHaveBeenCalledWith(
        "chat.generateName",
        expect.objectContaining({
          context: expect.stringContaining("sales.csv"),
        }),
        expect.anything(),
      );
    });
  });

  describe("tool calling", () => {
    it("should execute tool calls and include results in conversation", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Show me the data",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      // First call: AI requests a tool
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "getRecords",
              arguments: { datasetId: "ds-1", limit: 5 },
            },
          },
        ],
        promptTokens: 100,
        completionTokens: 20,
      });

      // Tool action result
      callStubs["tools.getRecords"] = {
        rows: [{ id: 1, name: "Test" }],
        total: 100,
      };

      // Stub dataset.getDataset for validation
      callStubs["dataset.getDataset"] = {
        datasetType: "structured-table",
        name: "Test Dataset",
      };

      // Second call: AI provides final answer
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Here is your data summary.",
        toolCalls: [],
        promptTokens: 200,
        completionTokens: 50,
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      // Should have tool_start and tool_end events
      const toolStart = parsed.find((e) => e.type === "tool_start");
      expect(toolStart).toBeDefined();
      expect(toolStart!.payload.toolName).toBe("getRecords");

      const toolEnd = parsed.find(
        (e) => e.type === "tool_end" && e.payload.toolName === "getRecords",
      );
      expect(toolEnd).toBeDefined();
      expect(toolEnd!.payload.success).toBe(true);

      // Should have final content
      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.content).toBe(
        "Here is your data summary.",
      );

      // Should track tool usage
      expect(doneEvent!.payload.message.toolsUsed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ toolName: "getRecords" }),
        ]),
      );
    });

    it("should handle tool execution failure", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Aggregate data",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "aggregate",
              arguments: { datasetId: "ds-1" },
            },
          },
        ],
      });

      callStubs["dataset.getDataset"] = {
        datasetType: "structured-table",
        name: "DS",
      };
      callStubs["tools.aggregate"] = () => {
        throw new Error("Dataset not found");
      };

      // After tool failure, AI provides final answer
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "I encountered an issue with the tool.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const toolEnd = parsed.find(
        (e) => e.type === "tool_end" && e.payload.toolName === "aggregate",
      );
      expect(toolEnd!.payload.success).toBe(false);
      expect(toolEnd!.payload.resultPreview).toContain("Dataset not found");

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
    });

    it("should handle unknown tool gracefully", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Do something",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "nonExistentTool",
              arguments: {},
            },
          },
        ],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Tool was not available.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const toolEnd = parsed.find(
        (e) =>
          e.type === "tool_end" && e.payload.toolName === "nonExistentTool",
      );
      expect(toolEnd!.payload.success).toBe(false);
      expect(toolEnd!.payload.resultPreview).toBe("Tool not available");
    });

    it("should track cited sources from tool calls with datasetId", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Analyze dataset",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "getRecords",
              arguments: {
                datasetId: "ds-123",
                datasetName: "My Dataset",
                field: "revenue",
              },
            },
          },
        ],
      });

      callStubs["dataset.getDataset"] = {
        datasetType: "structured-table",
        name: "My Dataset",
      };
      callStubs["tools.getRecords"] = { rows: [], total: 0 };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Analysis done.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.citedSources).toEqual([
        {
          datasetId: "ds-123",
          datasetName: "My Dataset",
          columnName: "revenue",
        },
      ]);
    });

    it("should not duplicate cited sources for same datasetId", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Analyze dataset twice",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "getRecords",
              arguments: { datasetId: "ds-123" },
            },
          },
          {
            function: {
              name: "aggregate",
              arguments: {
                datasetId: "ds-123",
                aggregations: [{ field: "revenue", operation: "sum" }],
              },
            },
          },
        ],
      });

      callStubs["dataset.getDataset"] = {
        datasetType: "structured-table",
        name: "DS",
      };
      callStubs["tools.getRecords"] = { rows: [] };
      callStubs["tools.aggregate"] = { result: 100 };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Done.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.citedSources).toHaveLength(1);
    });

    it("should include self-reflection message after tool calls", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Query data",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      const chatCalls: unknown[][] = [];
      mockAI.chatWithTools
        .mockImplementationOnce(async (params) => {
          chatCalls.push(params.messages);
          return {
            ...aiDefaults.chatWithToolsResult,
            content: "",
            toolCalls: [
              {
                function: {
                  name: "getRecords",
                  arguments: { datasetId: "ds-1" },
                },
              },
            ],
          };
        })
        .mockImplementationOnce(async (params) => {
          chatCalls.push(params.messages);
          return {
            ...aiDefaults.chatWithToolsResult,
            content: "Final response.",
            toolCalls: [],
          };
        });

      callStubs["dataset.getDataset"] = {
        datasetType: "structured-table",
        name: "DS",
      };
      callStubs["tools.getRecords"] = { rows: [] };

      const result = await sendMessageAction.handler(ctx as never);
      await collectSSEEvents(result);

      // The second AI call should include the self-reflection prompt
      const secondCallMessages = chatCalls[1] as Array<{
        content: string;
        role: string;
      }>;
      const reflectionMsg = secondCallMessages.find(
        (m) =>
          m.role === "system" &&
          m.content.includes("Before responding, reflect"),
      );
      expect(reflectionMsg).toBeDefined();
    });
  });

  describe("dataset type validation", () => {
    it("should reject structured tool on unstructured dataset", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Aggregate text data",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "aggregate",
              arguments: { datasetId: "ds-text" },
            },
          },
        ],
      });

      callStubs["dataset.getDataset"] = {
        datasetType: "unstructured-text",
        name: "Document",
      };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Cannot use that tool on text data.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const toolEnd = parsed.find(
        (e) => e.type === "tool_end" && e.payload.toolName === "aggregate",
      );
      expect(toolEnd!.payload.success).toBe(false);
      expect(toolEnd!.payload.resultPreview).toContain("structured data tool");
    });
  });

  describe("sub-agent delegation", () => {
    it("should delegate to sub-agent when createSubAgent tool is called", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Compare two datasets",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      // Main AI calls createSubAgent
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "createSubAgent",
              arguments: {
                prompt: "Analyze dataset A in detail",
              },
            },
          },
        ],
        promptTokens: 100,
        completionTokens: 20,
      });

      // Sub-agent AI call (no tools, direct answer)
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Sub-agent analysis result.",
        toolCalls: [],
        promptTokens: 50,
        completionTokens: 30,
      });

      // Main AI final answer after sub-agent
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Based on the sub-agent analysis, here is my conclusion.",
        toolCalls: [],
        promptTokens: 200,
        completionTokens: 40,
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      // Should have sub-agent status events
      const statusEvents = parsed.filter((e) => e.type === "status");
      const subAgentStarted = statusEvents.find((e) =>
        e.payload.message.includes("Sub-agent started"),
      );
      expect(subAgentStarted).toBeDefined();

      // Should have done event with aggregated tokens
      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.payload.message.promptStats.promptTokens).toBe(350);
      expect(doneEvent!.payload.message.promptStats.completionTokens).toBe(90);
    });

    it("should handle createSubAgent without prompt parameter", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Do something",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "createSubAgent",
              arguments: {},
            },
          },
        ],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Recovered from missing prompt.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const toolEnd = parsed.find(
        (e) => e.type === "tool_end" && e.payload.toolName === "createSubAgent",
      );
      expect(toolEnd!.payload.success).toBe(false);
      expect(toolEnd!.payload.resultPreview).toContain("requires a prompt");
    });

    it("should handle sub-agent failure gracefully", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Analyze with sub-agent",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "createSubAgent",
              arguments: { prompt: "Do analysis" },
            },
          },
        ],
      });

      // Sub-agent AI call throws
      mockAI.chatWithTools.mockRejectedValueOnce(
        new Error("AI provider timeout"),
      );

      // Main AI recovers
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Sub-agent failed, but I can still help.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const toolEnd = parsed.find(
        (e) => e.type === "tool_end" && e.payload.toolName === "createSubAgent",
      );
      expect(toolEnd!.payload.success).toBe(false);
      expect(toolEnd!.payload.resultPreview).toContain("AI provider timeout");

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
    });

    it("should handle sub-agent with tool calls", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Delegate analysis",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      // Main AI calls createSubAgent
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "createSubAgent",
              arguments: { prompt: "Sample the data" },
            },
          },
        ],
      });

      // Sub-agent first call: requests a tool
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "getRecords",
              arguments: { datasetId: "ds-1" },
            },
          },
        ],
      });

      callStubs["dataset.getDataset"] = {
        datasetType: "structured-table",
        name: "DS",
      };
      callStubs["tools.getRecords"] = {
        rows: [{ id: 1 }],
        total: 50,
      };

      // Sub-agent second call: final answer
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Sub-agent found 50 rows.",
        toolCalls: [],
      });

      // Main AI final answer
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "The dataset has 50 rows.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.payload.message.toolsUsed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ toolName: "getRecords" }),
        ]),
      );
    });
  });

  describe("confidence score extraction", () => {
    it("should extract confidence score between 0 and 1", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "How confident?",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "The result is X. Confidence: 0.85",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.confidenceScore).toBe(0.85);
    });

    it("should normalize confidence score from percentage (1-100)", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "How confident?",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Results look good. Confidence: 90",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.confidenceScore).toBe(0.9);
    });

    it("should return null confidence when no score in content", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Simple question",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Just a plain answer.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.confidenceScore).toBeNull();
    });
  });

  describe("empty response handling", () => {
    it("should retry when AI returns empty content", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Empty first try",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      // First call: empty response
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [],
      });

      // Second call: actual response
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Got it on retry.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.content).toBe("Got it on retry.");

      // Should have an empty response reasoning step
      const retryReasoning = parsed.find(
        (e) =>
          e.type === "reasoning" && e.payload.step.includes("Empty response"),
      );
      expect(retryReasoning).toBeDefined();
    });

    it("should provide fallback message when all iterations produce empty content", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Never responds",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      // All calls return empty
      mockAI.chatWithTools.mockResolvedValue({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.content).toContain(
        "unable to generate a response",
      );
    });
  });

  describe("error handling", () => {
    it("should handle AI adapter errors gracefully", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Cause an error",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockRejectedValueOnce(
        new Error("Connection refused"),
      );

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.content).toContain(
        "encountered an error",
      );
      expect(doneEvent!.payload.message.content).toContain(
        "Connection refused",
      );
    });

    it("should handle processStream top-level error via catch handler", async () => {
      // This tests when processStream itself throws before setup
      // We do this by making dataSource fail
      const { ctx } = createCtx({
        content: "Trigger error",
        conversationId: CONVERSATION_ID,
      });

      // The conversation lookup will find nothing and emit error + end
      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const errorOrDone = parsed.find(
        (e) => e.type === "error" || e.type === "done",
      );
      expect(errorOrDone).toBeDefined();
    });
  });

  describe("reasoning steps", () => {
    it("should stream reasoning steps via onReasoning callback", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Think carefully",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockImplementationOnce(async (params) => {
        if (params.onReasoning) {
          params.onReasoning("Step 1: Understanding the question");
          params.onReasoning("Step 2: Formulating response");
        }
        return {
          ...aiDefaults.chatWithToolsResult,
          content: "Thoughtful answer.",
          toolCalls: [],
        };
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const reasoningEvents = parsed.filter((e) => e.type === "reasoning");
      const hasStep1 = reasoningEvents.some((e) =>
        e.payload.step.includes("Step 1"),
      );
      const hasStep2 = reasoningEvents.some((e) =>
        e.payload.step.includes("Step 2"),
      );
      expect(hasStep1).toBe(true);
      expect(hasStep2).toBe(true);

      // Should be saved in the message
      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.reasoningSteps).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Step 1"),
          expect.stringContaining("Step 2"),
        ]),
      );
    });
  });

  describe("AI log creation", () => {
    it("should create an AILog entry for the interaction", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Log this interaction",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Logged response.",
        toolCalls: [],
        promptTokens: 100,
        completionTokens: 25,
      });

      const result = await sendMessageAction.handler(ctx as never);
      await collectSSEEvents(result);

      const logs = await testDs.getRepository(AILog).find();
      expect(logs).toHaveLength(1);
      expect(logs[0].promptSent).toBe("Log this interaction");
      expect(logs[0].responseReceived).toBe("Logged response.");
      expect(logs[0].promptTokens).toBe(100);
      expect(logs[0].completionTokens).toBe(25);
      expect(logs[0].totalTokens).toBe(125);
      expect(logs[0].conversationId).toBe(CONVERSATION_ID);
      expect(logs[0].sessionId).toBe(SESSION_ID);
      expect(logs[0].status).toBe("success");
      expect(logs[0].type).toBe("chat");
    });

    it("should log tool calls in AILog", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Use tools",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "getRecords",
              arguments: { datasetId: "ds-1" },
            },
          },
        ],
      });

      callStubs["dataset.getDataset"] = {
        datasetType: "structured-table",
        name: "DS",
      };
      callStubs["tools.getRecords"] = { rows: [] };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Done with tools.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      await collectSSEEvents(result);

      const logs = await testDs.getRepository(AILog).find();
      expect(logs).toHaveLength(1);
      expect(logs[0].toolCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ toolName: "getRecords" }),
        ]),
      );
    });

    it("should save null promptStats when no tokens reported", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "No tokens",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Response without tokens.",
        toolCalls: [],
        promptTokens: 0,
        completionTokens: 0,
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent!.payload.message.promptStats).toBeNull();
    });
  });

  describe("conversation messageCount update", () => {
    it("should increment conversation messageCount by 2", async () => {
      await seedConversation({ messageCount: 3 });
      const { callStubs, ctx } = createCtx({
        content: "Increment count",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Response.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      await collectSSEEvents(result);

      const conv = await testDs
        .getRepository(Conversation)
        .findOneBy({ id: CONVERSATION_ID });
      expect(conv!.messageCount).toBe(5);
    });
  });

  describe("system prompt update", () => {
    it("should update conversation systemPrompt from buildDynamicSystemPrompt", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Update prompt",
        conversationId: CONVERSATION_ID,
      });
      callStubs["chat.buildDynamicSystemPrompt"] = {
        systemPrompt: "Updated dynamic system prompt.",
      };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Response.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      await collectSSEEvents(result);

      const conv = await testDs
        .getRepository(Conversation)
        .findOneBy({ id: CONVERSATION_ID });
      expect(conv!.systemPrompt).toBe("Updated dynamic system prompt.");
    });
  });

  describe("conversation history loading", () => {
    it("should include existing messages in AI context, excluding system messages", async () => {
      await seedConversation({
        existingMessages: [
          { role: MessageRole.SYSTEM, content: "System message" },
          { role: MessageRole.USER, content: "Previous question" },
          {
            role: MessageRole.ASSISTANT,
            content: "Previous answer",
          },
        ],
      });

      const { callStubs, ctx } = createCtx({
        content: "Follow up",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      let capturedMessages: unknown[] = [];
      mockAI.chatWithTools.mockImplementationOnce(async (params) => {
        capturedMessages = params.messages;
        return {
          ...aiDefaults.chatWithToolsResult,
          content: "Follow up answer.",
          toolCalls: [],
        };
      });

      const result = await sendMessageAction.handler(ctx as never);
      await collectSSEEvents(result);

      // Messages should include system prompt + non-system history + current user message
      const msgs = capturedMessages as Array<{
        content: string;
        role: string;
      }>;
      expect(msgs[0].role).toBe("system");
      // System messages from history should be filtered out
      const systemHistoryMsg = msgs.find(
        (m) => m.role !== "system" && m.content === "System message",
      );
      expect(systemHistoryMsg).toBeUndefined();
      // Previous user and assistant messages should be present
      const prevUser = msgs.find((m) => m.content === "Previous question");
      expect(prevUser).toBeDefined();
      const prevAssistant = msgs.find((m) => m.content === "Previous answer");
      expect(prevAssistant).toBeDefined();
    });
  });

  describe("SSE event format", () => {
    it("should emit status events during processing", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Status check",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Done.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const statusEvents = parsed.filter((e) => e.type === "status");
      expect(statusEvents.length).toBeGreaterThanOrEqual(3);

      const statusMessages = statusEvents.map((e) => e.payload.message);
      expect(statusMessages).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Verifying"),
          expect.stringContaining("Building context"),
          expect.stringContaining("Thinking"),
        ]),
      );
    });
  });

  describe("formatToolResult toonEncode fallback", () => {
    it("should fall back to JSON when toonEncode throws", async () => {
      const toonMock = jest.requireMock("@toon-format/toon");
      toonMock.encode.mockImplementationOnce(() => {
        throw new Error("TOON encoding failed");
      });

      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Toon failure",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "getRecords",
              arguments: { datasetId: "ds-1" },
            },
          },
        ],
      });

      callStubs["dataset.getDataset"] = {
        datasetType: "structured-table",
        name: "DS",
      };
      callStubs["tools.getRecords"] = { data: [1, 2, 3] };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Handled fallback.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const toolEnd = parsed.find(
        (e) => e.type === "tool_end" && e.payload.toolName === "getRecords",
      );
      expect(toolEnd).toBeDefined();
      expect(toolEnd!.payload.success).toBe(true);
    });

    it("should use string tool result directly without toonEncode", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "String result",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "getRecords",
              arguments: { datasetId: "ds-1" },
            },
          },
        ],
      });

      callStubs["dataset.getDataset"] = {
        datasetType: "structured-table",
        name: "DS",
      };
      callStubs["tools.getRecords"] = "plain text result";

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Done.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
    });
  });

  describe("sub-agent edge cases", () => {
    it("should handle sub-agent with streaming content and reasoning callbacks", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Stream sub-agent",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "createSubAgent",
              arguments: { prompt: "Analyze in detail" },
            },
          },
        ],
      });

      mockAI.chatWithTools.mockImplementationOnce(async (params) => {
        if (params.onContent) {
          params.onContent("Streamed ");
          params.onContent("answer.");
        }
        if (params.onReasoning) {
          params.onReasoning("Sub-agent thinking...");
        }
        return {
          ...aiDefaults.chatWithToolsResult,
          content: "",
          toolCalls: [],
          promptTokens: 30,
          completionTokens: 15,
        };
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Final from main agent.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();

      const reasoningEvents = parsed.filter((e) => e.type === "reasoning");
      const subAgentReasoning = reasoningEvents.find((e) =>
        e.payload.step.includes("[Sub-agent] Sub-agent thinking"),
      );
      expect(subAgentReasoning).toBeDefined();
    });

    it("should handle sub-agent empty response with retry", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Sub-agent empty",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "createSubAgent",
              arguments: { prompt: "Analyze" },
            },
          },
        ],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Sub-agent recovered.",
        toolCalls: [],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Based on sub-agent result.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
    });

    it("should handle sub-agent tool call with unknown tool", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Sub-agent unknown tool",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "createSubAgent",
              arguments: { prompt: "Use an unknown tool" },
            },
          },
        ],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "unknownSubTool",
              arguments: {},
            },
          },
        ],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Sub-agent done.",
        toolCalls: [],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "All done.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();

      const toolEnds = parsed.filter(
        (e) => e.type === "tool_end" && e.payload.toolName === "unknownSubTool",
      );
      expect(toolEnds.length).toBeGreaterThanOrEqual(1);
      expect(toolEnds[0].payload.success).toBe(false);
    });

    it("should handle sub-agent tool with dataset type mismatch", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Sub-agent type mismatch",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "createSubAgent",
              arguments: { prompt: "Use wrong tool type" },
            },
          },
        ],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "aggregate",
              arguments: { datasetId: "ds-text" },
            },
          },
        ],
      });

      callStubs["dataset.getDataset"] = {
        datasetType: "unstructured-text",
        name: "Text Doc",
      };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Sub-agent handled mismatch.",
        toolCalls: [],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Done.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const toolEnd = parsed.find(
        (e) =>
          e.type === "tool_end" &&
          e.payload.toolName === "aggregate" &&
          !e.payload.success,
      );
      expect(toolEnd).toBeDefined();
    });

    it("should handle sub-agent tool execution failure", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Sub-agent tool fail",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "createSubAgent",
              arguments: { prompt: "Sample data" },
            },
          },
        ],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "getRecords",
              arguments: { datasetId: "ds-1" },
            },
          },
        ],
      });

      callStubs["dataset.getDataset"] = {
        datasetType: "structured-table",
        name: "DS",
      };
      callStubs["tools.getRecords"] = () => {
        throw new Error("DB connection lost");
      };

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Sub-agent recovered from tool failure.",
        toolCalls: [],
      });

      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Done despite failures.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const toolEnd = parsed.find(
        (e) =>
          e.type === "tool_end" &&
          e.payload.toolName === "getRecords" &&
          !e.payload.success,
      );
      expect(toolEnd).toBeDefined();
      expect(toolEnd!.payload.resultPreview).toContain("DB connection lost");
    });
  });

  describe("processStream catch handler", () => {
    it("should handle non-Error thrown in processStream", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "String throw",
        conversationId: CONVERSATION_ID,
      });
      callStubs["chat.buildDynamicSystemPrompt"] = () => {
        throw "string error value";
      };

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const errorEvent = parsed.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.payload.message).toContain("string error value");
    });
  });

  describe("action definition", () => {
    it("should have correct REST config", () => {
      expect(sendMessageAction.rest).toBe("POST /messages");
    });

    it("should have correct params validation", () => {
      expect(sendMessageAction.params).toEqual({
        content: { type: "string", max: 10000, min: 1 },
        conversationId: { type: "uuid" },
      });
    });
  });

  describe("orphan chart placeholder stripping", () => {
    it("should strip [chart:N] placeholders when AI never called generateChartSpec", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Show me a chart",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      // AI returns text with chart placeholder but never calls generateChartSpec
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Here is the chart:\n\n[chart:0]\n\nAs shown above.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();

      // Placeholder should be stripped and content trimmed
      expect(doneEvent!.payload.message.content).not.toContain("[chart:");
      expect(doneEvent!.payload.message.metadata).toBeNull();

      // Verify persisted content is also stripped
      const messages = await testDs.getRepository(ChatMessage).find({
        order: { createdAt: "ASC" },
        where: { conversationId: CONVERSATION_ID },
      });
      const assistantMsg = messages.find(
        (m) => m.role === MessageRole.ASSISTANT,
      );
      expect(assistantMsg!.content).not.toContain("[chart:");
    });

    it("should preserve valid [chart:N] placeholders when charts exist", async () => {
      await seedConversation();
      const { callStubs, ctx } = createCtx({
        content: "Show me a chart of sales",
        conversationId: CONVERSATION_ID,
      });
      registerBasicStubs(callStubs);

      const chartSpec = {
        chartType: "bar",
        data: [
          { label: "Q1", value: 100 },
          { label: "Q2", value: 200 },
        ],
        title: "Sales by Quarter",
      };

      // First AI call: tool call to generateChartSpec
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "",
        toolCalls: [
          {
            function: {
              name: "generateChartSpec",
              arguments: chartSpec,
            },
          },
        ],
      });

      callStubs["tools.generateChartSpec"] = chartSpec;

      // Second AI call: final response with chart placeholder
      mockAI.chatWithTools.mockResolvedValueOnce({
        ...aiDefaults.chatWithToolsResult,
        content: "Here is the chart:\n\n[chart:0]\n\nAs shown above.",
        toolCalls: [],
      });

      const result = await sendMessageAction.handler(ctx as never);
      const events = await collectSSEEvents(result);
      const parsed = parseSSEEvents(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();

      // Valid placeholder should be preserved
      expect(doneEvent!.payload.message.content).toContain("[chart:0]");
      expect(doneEvent!.payload.message.metadata).toBeDefined();
      expect(doneEvent!.payload.message.metadata.charts).toHaveLength(1);
    });
  });
});
