/**
 * Tests for session/verifySessionOwnership.action.ts
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

import verifySessionOwnershipAction from "../verifySessionOwnership.action";

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
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("session.verifySessionOwnership action", () => {
  defineTest({
    name: "should succeed when session belongs to user",
    action: verifySessionOwnershipAction,
    params: { sessionId: SESSION_ID, userId: TEST_USER_ID },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "My Session",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.sessionId).toBe(SESSION_ID);
      expect(result.userId).toBe(TEST_USER_ID);
    },
  });

  defineTest({
    name: "should throw 404 when session does not exist",
    action: verifySessionOwnershipAction,
    params: {
      sessionId: "00000000-0000-4000-8000-000000000000",
      userId: TEST_USER_ID,
    },
    db: () => testDs,
    expectError: "Session not found",
  });

  defineTest({
    name: "should throw 404 when session belongs to a different user",
    action: verifySessionOwnershipAction,
    params: { sessionId: SESSION_ID, userId: OTHER_USER_ID },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "My Session",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    expectError: "Session not found",
  });
});
