/**
 * Tests for session/create.action.ts
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

import createAction from "../create.action";

beforeAll(async () => {
  testDs = await createTestDataSource([Session]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [Session]);
});

describe("session.create action", () => {
  defineTest({
    name: "should create a session with a custom name",
    action: createAction,
    params: { name: "My Test Session" },
    db: () => testDs,
    assertResult: (result) => {
      expect(result.name).toBe("My Test Session");
      expect(result.status).toBe(SessionStatus.EMPTY);
      expect(result.datasetCount).toBe(0);
      expect(result.conversationCount).toBe(0);
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
    },
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions).toHaveLength(1);
          expect(sessions[0].name).toBe("My Test Session");
          expect(sessions[0].status).toBe(SessionStatus.EMPTY);
        },
      },
    ],
  });

  defineTest({
    name: "should auto-generate a name when none is provided",
    action: createAction,
    params: {},
    db: () => testDs,
    assertResult: (result) => {
      expect(result.name).toMatch(/^Session — /);
      expect(result.status).toBe(SessionStatus.EMPTY);
    },
  });

  defineTest({
    name: "should have proper action schema",
    action: createAction,
    params: {},
    assertResult: () => {
      expect(createAction.params).toEqual({
        name: { type: "string", optional: true, min: 1, max: 200 },
      });
      expect(createAction.rest).toBe("POST /");
    },
  });
});
