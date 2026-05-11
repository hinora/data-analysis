/**
 * Tests for auth/verifyToken.action.ts
 */

import {
  clearTestDatabase,
  createTestDataSource,
  defineTest,
  destroyTestDataSource,
} from "core.lib/testing";
import type { DataSource } from "typeorm";
import { User } from "../../../db/user.entity";
import { signToken } from "../jwt-config";

let testDs: DataSource;

jest.mock("../../../db", () => ({
  User: require("../../../db/user.entity").User,
  get dataSource() {
    return testDs;
  },
}));

import verifyTokenAction from "../verifyToken.action";

beforeAll(async () => {
  testDs = await createTestDataSource([User]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [User]);
});

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("auth.verifyToken action", () => {
  defineTest({
    name: "should verify a valid token and return user",
    action: verifyTokenAction,
    params: {
      token: signToken({ email: "test@example.com", id: USER_ID }),
    },
    db: () => testDs,
    before: [
      {
        entity: User,
        data: [
          {
            email: "test@example.com",
            id: USER_ID,
            isActive: true,
            nickName: "Test User",
            password: "hashed",
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.valid).toBe(true);
      expect(result.user.id).toBe(USER_ID);
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.nickName).toBe("Test User");
    },
  });

  defineTest({
    name: "should reject an invalid token",
    action: verifyTokenAction,
    params: { token: "invalid.token.here" },
    db: () => testDs,
    expectError: "Invalid or expired token",
  });

  defineTest({
    name: "should reject token for non-existent user",
    action: verifyTokenAction,
    params: {
      token: signToken({
        email: "ghost@example.com",
        id: "00000000-0000-4000-8000-000000000000",
      }),
    },
    db: () => testDs,
    expectError: "User not found",
  });

  defineTest({
    name: "should reject token for inactive user",
    action: verifyTokenAction,
    params: {
      token: signToken({ email: "inactive@example.com", id: USER_ID }),
    },
    db: () => testDs,
    before: [
      {
        entity: User,
        data: [
          {
            email: "inactive@example.com",
            id: USER_ID,
            isActive: false,
            nickName: "Inactive",
            password: "hashed",
          },
        ],
      },
    ],
    expectError: "Account is deactivated",
  });
});
