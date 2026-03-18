/**
 * Tests for conversation/getConversation.action.ts
 */

import {
  clearTestDatabase,
  createTestDataSource,
  defineTest,
  destroyTestDataSource,
} from "core.lib/testing";
import type { DataSource } from "typeorm";
import { ChatMessage } from "../../../db/chat-message.entity";
import { Conversation } from "../../../db/conversation.entity";
import { Session, SessionStatus } from "../../../db/session.entity";

let testDs: DataSource;

jest.mock("../../../db", () => ({
  get dataSource() {
    return testDs;
  },
}));

import getConversationAction from "../getConversation.action";

const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEST_META = {
  user: {
    id: TEST_USER_ID,
    email: "test@example.com",
    isActive: true,
    isVerified: true,
    nickName: "Test User",
  },
};

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

describe("conversation.getConversation action", () => {
  defineTest({
    name: "should return conversation with updated system prompt",
    action: getConversationAction,
    params: { id: CONVERSATION_ID },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "chat.buildDynamicSystemPrompt": {
        systemPrompt: "Dynamic system prompt",
      },
    },
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test Session",
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
            name: "Test Conversation",
            systemPrompt: "Old prompt",
            messageCount: 0,
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.id).toBe(CONVERSATION_ID);
      expect(result.name).toBe("Test Conversation");
      expect(result.systemPrompt).toBe("Dynamic system prompt");
    },
    after: [
      {
        entity: Conversation,
        assert: (conversations) => {
          expect(conversations[0].systemPrompt).toBe("Dynamic system prompt");
        },
      },
    ],
  });

  defineTest({
    name: "should throw 404 when conversation not found",
    action: getConversationAction,
    params: { id: "00000000-0000-4000-8000-000000000000" },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "chat.buildDynamicSystemPrompt": { systemPrompt: "" },
    },
    expectError: "Conversation not found",
  });
});
