/**
 * Tests for session/deleteSession.action.ts
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

import deleteSessionAction from "../deleteSession.action";

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

describe("session.deleteSession action", () => {
  defineTest({
    name: "should delete a session and emit event",
    action: deleteSessionAction,
    params: { id: SESSION_ID },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            id: SESSION_ID,
            name: "To Delete",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.success).toBe(true);
      expect(result.id).toBe(SESSION_ID);
    },
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions).toHaveLength(0);
        },
      },
    ],
  });

  defineTest({
    name: "should throw 404 when session not found",
    action: deleteSessionAction,
    params: { id: "00000000-0000-4000-8000-000000000000" },
    db: () => testDs,
    expectError: "Session not found",
  });
});
