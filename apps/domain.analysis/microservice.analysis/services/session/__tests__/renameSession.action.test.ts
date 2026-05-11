/**
 * Tests for session/renameSession.action.ts
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

import renameSessionAction from "../renameSession.action";

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

const TEST_META = {
  user: {
    email: "test@example.com",
    id: TEST_USER_ID,
    isActive: true,
    isVerified: false,
    nickName: "Test User",
  },
};

describe("session.renameSession action", () => {
  defineTest({
    name: "should rename an existing session",
    action: renameSessionAction,
    params: { id: SESSION_ID, name: "New Name" },
    meta: TEST_META,
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "Old Name",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
            userId: TEST_USER_ID,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.name).toBe("New Name");
      expect(result.id).toBe(SESSION_ID);
    },
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions).toHaveLength(1);
          expect(sessions[0].name).toBe("New Name");
        },
      },
    ],
  });

  defineTest({
    name: "should throw 404 when session not found",
    action: renameSessionAction,
    params: { id: "00000000-0000-4000-8000-000000000000", name: "New" },
    meta: TEST_META,
    db: () => testDs,
    expectError: "Session not found",
  });
});
