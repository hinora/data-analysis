/**
 * Tests for conversation/verifyConversationOwnership.action.ts
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

import verifyConversationOwnershipAction from "../verifyConversationOwnership.action";

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
const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("conversation.verifyConversationOwnership action", () => {
  defineTest({
    name: "should succeed when conversation belongs to user",
    action: verifyConversationOwnershipAction,
    params: { conversationId: CONVERSATION_ID, userId: TEST_USER_ID },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "My Session",
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
            name: "My Conversation",
            systemPrompt: "",
            messageCount: 0,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.conversationId).toBe(CONVERSATION_ID);
      expect(result.sessionId).toBe(SESSION_ID);
      expect(result.userId).toBe(TEST_USER_ID);
    },
  });

  defineTest({
    name: "should throw 404 when conversation does not exist",
    action: verifyConversationOwnershipAction,
    params: {
      conversationId: "00000000-0000-4000-8000-000000000000",
      userId: TEST_USER_ID,
    },
    db: () => testDs,
    expectError: "Conversation not found",
  });

  defineTest({
    name: "should throw 404 when session belongs to a different user",
    action: verifyConversationOwnershipAction,
    params: { conversationId: CONVERSATION_ID, userId: OTHER_USER_ID },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "My Session",
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
            name: "My Conversation",
            systemPrompt: "",
            messageCount: 0,
          },
        ],
      },
    ],
    expectError: "Conversation not found",
  });
});
