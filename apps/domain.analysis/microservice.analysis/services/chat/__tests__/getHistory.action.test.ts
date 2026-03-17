/**
 * Tests for chat/getHistory.action.ts
 */

import {
  clearTestDatabase,
  createTestDataSource,
  defineTest,
  destroyTestDataSource,
} from "core.lib/testing";
import type { DataSource } from "typeorm";
import { ChatMessage, MessageRole } from "../../../db/chat-message.entity";
import { Conversation } from "../../../db/conversation.entity";
import { Session, SessionStatus } from "../../../db/session.entity";

let testDs: DataSource;

jest.mock("../../../db", () => ({
  get dataSource() {
    return testDs;
  },
}));

import getHistoryAction from "../getHistory.action";

beforeAll(async () => {
  testDs = await createTestDataSource([Session, Conversation, ChatMessage]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [ChatMessage, Conversation, Session]);
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";

describe("chat.getHistory action", () => {
  defineTest({
    name: "should return messages for a conversation",
    action: getHistoryAction,
    params: { conversationId: CONVERSATION_ID },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Session",
            status: SessionStatus.ACTIVE,
            datasetCount: 1,
            conversationCount: 1,
          },
        ],
      },
      {
        entity: Conversation,
        data: [
          {
            id: CONVERSATION_ID,
            sessionId: SESSION_ID,
            name: "Test Conversation",
            systemPrompt: "System prompt",
            messageCount: 2,
          },
        ],
      },
      {
        entity: ChatMessage,
        data: [
          {
            conversationId: CONVERSATION_ID,
            sessionId: SESSION_ID,
            role: MessageRole.USER,
            content: "Hello",
          },
          {
            conversationId: CONVERSATION_ID,
            sessionId: SESSION_ID,
            role: MessageRole.ASSISTANT,
            content: "Hi there!",
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.messages).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.hasMore).toBe(false);
    },
  });

  defineTest({
    name: "should throw 404 when conversation not found",
    action: getHistoryAction,
    params: { conversationId: "00000000-0000-4000-8000-000000000000" },
    db: () => testDs,
    expectError: "Conversation not found",
  });

  defineTest({
    name: "should support pagination",
    action: getHistoryAction,
    params: { conversationId: CONVERSATION_ID, page: 1, limit: 1 },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Session",
            status: SessionStatus.ACTIVE,
            datasetCount: 1,
            conversationCount: 1,
          },
        ],
      },
      {
        entity: Conversation,
        data: [
          {
            id: CONVERSATION_ID,
            sessionId: SESSION_ID,
            name: "Test Conversation",
            systemPrompt: "",
            messageCount: 2,
          },
        ],
      },
      {
        entity: ChatMessage,
        data: [
          {
            conversationId: CONVERSATION_ID,
            sessionId: SESSION_ID,
            role: MessageRole.USER,
            content: "First",
          },
          {
            conversationId: CONVERSATION_ID,
            sessionId: SESSION_ID,
            role: MessageRole.ASSISTANT,
            content: "Second",
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.messages).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(true);
    },
  });

  defineTest({
    name: "should filter out system messages when excludeSystem is true",
    action: getHistoryAction,
    params: { conversationId: CONVERSATION_ID, excludeSystem: true },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Session",
            status: SessionStatus.ACTIVE,
            datasetCount: 1,
            conversationCount: 1,
          },
        ],
      },
      {
        entity: Conversation,
        data: [
          {
            id: CONVERSATION_ID,
            sessionId: SESSION_ID,
            name: "Test",
            systemPrompt: "",
            messageCount: 3,
          },
        ],
      },
      {
        entity: ChatMessage,
        data: [
          {
            conversationId: CONVERSATION_ID,
            sessionId: SESSION_ID,
            role: MessageRole.SYSTEM,
            content: "You are a helpful assistant",
          },
          {
            conversationId: CONVERSATION_ID,
            sessionId: SESSION_ID,
            role: MessageRole.USER,
            content: "Hello",
          },
          {
            conversationId: CONVERSATION_ID,
            sessionId: SESSION_ID,
            role: MessageRole.ASSISTANT,
            content: "Hi!",
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.messages).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(
        result.messages.every((m: any) => m.role !== MessageRole.SYSTEM),
      ).toBe(true);
    },
  });

  defineTest({
    name: "should return messages with all fields",
    action: getHistoryAction,
    params: { conversationId: CONVERSATION_ID },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Session",
            status: SessionStatus.ACTIVE,
            datasetCount: 1,
            conversationCount: 1,
          },
        ],
      },
      {
        entity: Conversation,
        data: [
          {
            id: CONVERSATION_ID,
            sessionId: SESSION_ID,
            name: "Test",
            systemPrompt: "",
            messageCount: 1,
          },
        ],
      },
      {
        entity: ChatMessage,
        data: [
          {
            conversationId: CONVERSATION_ID,
            sessionId: SESSION_ID,
            role: MessageRole.USER,
            content: "What is this?",
            confidenceScore: null,
            citedSources: null,
            toolsUsed: null,
            reasoningSteps: null,
            promptStats: null,
          },
        ],
      },
    ],
    assertResult: (result) => {
      const msg = result.messages[0];
      expect(msg.content).toBe("What is this?");
      expect(msg.role).toBe(MessageRole.USER);
      expect(msg.conversationId).toBe(CONVERSATION_ID);
      expect(msg.id).toBeDefined();
      expect(msg.createdAt).toBeDefined();
    },
  });
});
