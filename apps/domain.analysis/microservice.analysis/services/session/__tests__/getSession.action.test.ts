/**
 * Tests for session/getSession.action.ts
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

import getSessionAction from "../getSession.action";

const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

describe("session.getSession action", () => {
  defineTest({
    name: "should return a session when found",
    action: getSessionAction,
    params: { id: SESSION_ID },
    meta: {
      user: {
        id: TEST_USER_ID,
        email: "test@example.com",
        nickName: "Test User",
        isActive: true,
        isVerified: true,
      },
    },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Test Session",
            userId: TEST_USER_ID,
            status: SessionStatus.HAS_DATA,
            datasetCount: 2,
            conversationCount: 1,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.id).toBe(SESSION_ID);
      expect(result.name).toBe("Test Session");
      expect(result.status).toBe(SessionStatus.HAS_DATA);
      expect(result.datasetCount).toBe(2);
      expect(result.conversationCount).toBe(1);
    },
  });

  defineTest({
    name: "should throw 404 when session not found",
    action: getSessionAction,
    params: { id: "00000000-0000-4000-8000-000000000000" },
    meta: {
      user: {
        id: TEST_USER_ID,
        email: "test@example.com",
        nickName: "Test User",
        isActive: true,
        isVerified: true,
      },
    },
    db: () => testDs,
    expectError: "Session not found",
  });
});
