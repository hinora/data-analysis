/**
 * Tests for conversation/listConversations.action.ts
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

import listConversationsAction from "../listConversations.action";

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

describe("conversation.listConversations action", () => {
  defineTest({
    name: "should return empty array when no conversations exist",
    action: listConversationsAction,
    params: { sessionId: SESSION_ID },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Empty Session",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result).toHaveLength(0);
    },
  });

  defineTest({
    name: "should return conversations for a session",
    action: listConversationsAction,
    params: { sessionId: SESSION_ID },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test Session",
            status: SessionStatus.ACTIVE,
            datasetCount: 1,
            conversationCount: 2,
          },
        ],
      },
      {
        entity: Conversation,
        data: [
          {
            sessionId: SESSION_ID,
            name: "Conversation A",
            systemPrompt: "",
            messageCount: 5,
          },
          {
            sessionId: SESSION_ID,
            name: "Conversation B",
            systemPrompt: "",
            messageCount: 3,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result).toHaveLength(2);
    },
  });
});
