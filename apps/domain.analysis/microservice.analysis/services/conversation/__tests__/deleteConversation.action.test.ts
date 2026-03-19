/**
 * Tests for conversation/deleteConversation.action.ts
 */

import { AILog } from "core.lib/database";
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

import deleteConversationAction from "../deleteConversation.action";

beforeAll(async () => {
  testDs = await createTestDataSource([
    Session,
    Conversation,
    ChatMessage,
    AILog,
  ]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [AILog, ChatMessage, Conversation, Session]);
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";

const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const TEST_META = {
  user: {
    id: TEST_USER_ID,
    email: "test@example.com",
    nickName: "Test User",
    isActive: true,
    isVerified: false,
  },
};

describe("conversation.deleteConversation action", () => {
  defineTest({
    name: "should delete conversation and cascade to messages",
    action: deleteConversationAction,
    params: { id: CONVERSATION_ID },
    meta: TEST_META,
    callStubs: {
      "session.verifySessionOwnership": {
        sessionId: SESSION_ID,
        userId: TEST_USER_ID,
      },
    },
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
            userId: TEST_USER_ID,
          },
        ],
      },
      {
        entity: Conversation,
        data: [
          {
            id: CONVERSATION_ID,
            sessionId: SESSION_ID,
            name: "To Delete",
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
            content: "Hello",
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.success).toBe(true);
      expect(result.id).toBe(CONVERSATION_ID);
    },
    after: [
      {
        entity: Conversation,
        assert: (conversations) => {
          expect(conversations).toHaveLength(0);
        },
      },
      {
        entity: ChatMessage,
        assert: (messages) => {
          expect(messages).toHaveLength(0);
        },
      },
    ],
  });

  defineTest({
    name: "should throw 404 when conversation not found",
    action: deleteConversationAction,
    params: { id: "00000000-0000-4000-8000-000000000000" },
    meta: TEST_META,
    db: () => testDs,
    expectError: "Conversation not found",
  });

  defineTest({
    name: "should decrement session conversation count",
    action: deleteConversationAction,
    params: { id: CONVERSATION_ID },
    meta: TEST_META,
    callStubs: {
      "session.verifySessionOwnership": {
        sessionId: SESSION_ID,
        userId: TEST_USER_ID,
      },
    },
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
            conversationCount: 2,
            userId: TEST_USER_ID,
          },
        ],
      },
      {
        entity: Conversation,
        data: [
          {
            id: CONVERSATION_ID,
            sessionId: SESSION_ID,
            name: "To Delete",
            systemPrompt: "",
            messageCount: 0,
          },
        ],
      },
    ],
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions[0].conversationCount).toBe(1);
        },
      },
    ],
  });
});
