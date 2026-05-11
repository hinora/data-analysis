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

describe("session.list action", () => {
  defineTest({
    name: "should return empty list when no sessions exist",
    action: listAction,
    params: {},
    meta: TEST_META,
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
    meta: TEST_META,
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
            userId: TEST_USER_ID,
          },
          {
            name: "Second Session",
            status: SessionStatus.HAS_DATA,
            datasetCount: 1,
            conversationCount: 0,
            userId: TEST_USER_ID,
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
    meta: TEST_META,
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
            userId: TEST_USER_ID,
          },
          {
            name: "Session B",
            status: SessionStatus.EMPTY,
            datasetCount: 0,
            conversationCount: 0,
            userId: TEST_USER_ID,
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
    meta: TEST_META,
    db: () => testDs,
    assertResult: (result) => {
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    },
  });
});
