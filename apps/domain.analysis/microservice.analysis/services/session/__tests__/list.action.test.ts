/**
 * Tests for session/list.action.ts
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

import listAction from "../list.action";

beforeAll(async () => {
  testDs = await createTestDataSource([Session]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [Session]);
});

describe("session.list action", () => {
  defineTest({
    name: "should return empty list when no sessions exist",
    action: listAction,
    params: {},
    db: () => testDs,
    assertResult: (result) => {
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(0);
    },
  });

  defineTest({
    name: "should return paginated sessions sorted by createdAt DESC",
    action: listAction,
    params: { page: 1, limit: 10 },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            name: "First Session",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
          },
          {
            name: "Second Session",
            status: SessionStatus.HAS_DATA,
            datasetCount: 1,
            conversationCount: 0,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    },
  });

  defineTest({
    name: "should respect pagination parameters",
    action: listAction,
    params: { page: 2, limit: 1 },
    db: () => testDs,
    before: [
      {
        entity: Session,
        data: [
          {
            name: "Session A",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
          },
          {
            name: "Session B",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(1);
      expect(result.totalPages).toBe(2);
    },
  });

  defineTest({
    name: "should use default pagination when not specified",
    action: listAction,
    params: {},
    db: () => testDs,
    assertResult: (result) => {
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    },
  });
});
