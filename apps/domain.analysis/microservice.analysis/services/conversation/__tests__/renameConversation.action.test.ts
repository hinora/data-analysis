/**
 * Tests for conversation/renameConversation.action.ts
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

import renameConversationAction from "../renameConversation.action";

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

describe("conversation.renameConversation action", () => {
  defineTest({
    name: "should rename an existing conversation",
    action: renameConversationAction,
    params: { id: CONVERSATION_ID, name: "New Name" },
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
            name: "Old Name",
            systemPrompt: "",
            messageCount: 0,
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.name).toBe("New Name");
    },
    after: [
      {
        entity: Conversation,
        assert: (conversations) => {
          expect(conversations[0].name).toBe("New Name");
        },
      },
    ],
  });

  defineTest({
    name: "should trim whitespace from name",
    action: renameConversationAction,
    params: { id: CONVERSATION_ID, name: "  Trimmed Name  " },
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
            name: "Old Name",
            systemPrompt: "",
            messageCount: 0,
          },
        ],
      },
    ],
    assertResult: (result: any) => {
      expect(result.name).toBe("Trimmed Name");
    },
  });

  defineTest({
    name: "should throw 404 when conversation not found",
    action: renameConversationAction,
    params: { id: "00000000-0000-4000-8000-000000000000", name: "New" },
    db: () => testDs,
    expectError: "Conversation not found",
  });
});
