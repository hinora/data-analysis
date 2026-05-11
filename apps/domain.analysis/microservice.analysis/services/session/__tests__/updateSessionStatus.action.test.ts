/**
 * Tests for session/updateSessionStatus.action.ts
 */

import {
  clearTestDatabase,
  createTestDataSource,
  defineTest,
  destroyTestDataSource,
} from "core.lib/testing";
import type { DataSource } from "typeorm";
import { Session, SessionStatus } from "../../../db/session.entity";

let testDs: DataSource;

jest.mock("../../../db", () => ({
  get dataSource() {
    return testDs;
  },
}));

import updateSessionStatusAction from "../updateSessionStatus.action";

beforeAll(async () => {
  testDs = await createTestDataSource([Session]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [Session]);
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("session.updateSessionStatus action", () => {
  defineTest({
    name: "should transition empty → has-data on dataset-imported",
    action: updateSessionStatusAction,
    params: { sessionId: SESSION_ID, trigger: "dataset-imported" },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.previousStatus).toBe(SessionStatus.EMPTY);
      expect(result.newStatus).toBe(SessionStatus.HAS_DATA);
      expect(result.changed).toBe(true);
    },
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions[0].status).toBe(SessionStatus.HAS_DATA);
          expect(sessions[0].datasetCount).toBe(1);
        },
      },
    ],
  });

  defineTest({
    name: "should increment dataset count when already has data",
    action: updateSessionStatusAction,
    params: { sessionId: SESSION_ID, trigger: "dataset-imported" },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test",
            status: SessionStatus.HAS_DATA,
            datasetCount: 2,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.changed).toBe(true);
    },
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions[0].datasetCount).toBe(3);
        },
      },
    ],
  });

  defineTest({
    name: "should increment dataset count with custom count",
    action: updateSessionStatusAction,
    params: { sessionId: SESSION_ID, trigger: "dataset-imported", count: 3 },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test",
            status: SessionStatus.HAS_DATA,
            datasetCount: 1,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions[0].datasetCount).toBe(4);
        },
      },
    ],
  });

  defineTest({
    name: "should transition has-data → active on conversation-created",
    action: updateSessionStatusAction,
    params: { sessionId: SESSION_ID, trigger: "conversation-created" },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test",
            status: SessionStatus.HAS_DATA,
            datasetCount: 1,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.previousStatus).toBe(SessionStatus.HAS_DATA);
      expect(result.newStatus).toBe(SessionStatus.ACTIVE);
      expect(result.changed).toBe(true);
    },
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions[0].status).toBe(SessionStatus.ACTIVE);
          expect(sessions[0].conversationCount).toBe(1);
        },
      },
    ],
  });

  defineTest({
    name: "should increment conversation count when already active",
    action: updateSessionStatusAction,
    params: { sessionId: SESSION_ID, trigger: "conversation-created" },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test",
            status: SessionStatus.ACTIVE,
            datasetCount: 1,
            conversationCount: 2,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions[0].conversationCount).toBe(3);
        },
      },
    ],
  });

  defineTest({
    name: "should not change status on conversation-created when empty",
    action: updateSessionStatusAction,
    params: { sessionId: SESSION_ID, trigger: "conversation-created" },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.changed).toBe(false);
    },
  });

  defineTest({
    name: "should decrement dataset and transition to empty on dataset-deleted",
    action: updateSessionStatusAction,
    params: { sessionId: SESSION_ID, trigger: "dataset-deleted" },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test",
            status: SessionStatus.HAS_DATA,
            datasetCount: 1,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.changed).toBe(true);
      expect(result.newStatus).toBe(SessionStatus.EMPTY);
    },
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions[0].status).toBe(SessionStatus.EMPTY);
          expect(sessions[0].datasetCount).toBe(0);
        },
      },
    ],
  });

  defineTest({
    name: "should decrement dataset without changing status when count > 1",
    action: updateSessionStatusAction,
    params: { sessionId: SESSION_ID, trigger: "dataset-deleted" },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test",
            status: SessionStatus.ACTIVE,
            datasetCount: 3,
            conversationCount: 1,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions[0].datasetCount).toBe(2);
        },
      },
    ],
  });

  defineTest({
    name: "should throw 404 when session not found",
    action: updateSessionStatusAction,
    params: {
      sessionId: "00000000-0000-4000-8000-000000000000",
      trigger: "dataset-imported",
    },
    db: () => testDs,
    expectError: "Session not found",
  });
});
