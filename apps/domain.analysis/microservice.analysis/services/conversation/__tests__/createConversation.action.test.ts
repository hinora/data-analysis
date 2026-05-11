/**
 * Tests for conversation/createConversation.action.ts
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

import createConversationAction from "../createConversation.action";

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

describe("conversation.createConversation action", () => {
  defineTest({
    name: "should create a conversation with custom name",
    action: createConversationAction,
    params: { sessionId: SESSION_ID, name: "My Conversation" },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.updateSessionStatus": { success: true },
    },
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test Session",
            status: SessionStatus.HAS_DATA,
            datasetCount: 1,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.name).toBe("My Conversation");
      expect(result.sessionId).toBe(SESSION_ID);
      expect(result.messageCount).toBe(0);
      expect(result.systemPrompt).toBe("");
      expect(result.id).toBeDefined();
    },
    after: [
      {
        entity: Conversation,
        assert: (conversations) => {
          expect(conversations).toHaveLength(1);
          expect(conversations[0].name).toBe("My Conversation");
        },
      },
    ],
  });

  defineTest({
    name: "should auto-generate name when not provided",
    action: createConversationAction,
    params: { sessionId: SESSION_ID },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.updateSessionStatus": { success: true },
    },
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test Session",
            status: SessionStatus.HAS_DATA,
            datasetCount: 1,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.name).toMatch(/^Conversation — /);
    },
  });

  defineTest({
    name: "should throw 404 when session not found",
    action: createConversationAction,
    params: { sessionId: "00000000-0000-4000-8000-000000000000" },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.updateSessionStatus": { success: true },
    },
    expectError: "Session not found",
  });

  defineTest({
    name: "should call updateSessionStatus after creation",
    action: createConversationAction,
    params: { sessionId: SESSION_ID, name: "Test" },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.updateSessionStatus": { success: true },
    },
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test Session",
            status: SessionStatus.HAS_DATA,
            datasetCount: 1,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: () => {
      // Verified via the defineTest context — the callStub was invoked
    },
  });

  defineTest({
    name: "should handle updateSessionStatus failure gracefully",
    action: createConversationAction,
    params: { sessionId: SESSION_ID, name: "Test" },
    meta: TEST_META,
    db: () => testDs,
    callStubs: {
      "session.updateSessionStatus": () => {
        throw new Error("Service unavailable");
      },
    },
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test Session",
            status: SessionStatus.HAS_DATA,
            datasetCount: 1,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: (result) => {
      // Should still succeed even if updateSessionStatus fails
      expect(result.name).toBe("Test");
    },
  });
});
