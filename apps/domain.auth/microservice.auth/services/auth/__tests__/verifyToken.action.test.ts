/**
 * Tests for auth/verifyToken.action.ts
 */

import * as bcrypt from "bcryptjs";
import {
  clearTestDatabase,
  createTestDataSource,
  defineTest,
  destroyTestDataSource,
} from "core.lib/testing";
import * as jwt from "jsonwebtoken";
import type { DataSource } from "typeorm";
import { User } from "../../../db/user.entity";

let testDs: DataSource;

jest.mock("../../../db", () => ({
  get dataSource() {
    return testDs;
  },
  sanitizeUser: jest.requireActual("../../../db").sanitizeUser,
  User: jest.requireActual("../../../db/user.entity").User,
}));

import verifyTokenAction from "../verifyToken.action";

const JWT_SECRET = "data-analysis-secret-key-change-in-production";
const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HASHED_PASSWORD = bcrypt.hashSync("testPassword123", 10);

beforeAll(async () => {
  testDs = await createTestDataSource([User]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [User]);
});

describe("auth.verifyToken action", () => {
  defineTest({
    name: "should verify valid token and return user",
    action: verifyTokenAction,
    params: {
      token: jwt.sign({ userId: TEST_USER_ID }, JWT_SECRET),
    },
    db: () => testDs,
    before: [
      {
        entity: User,
        data: [
          {
            id: TEST_USER_ID,
            email: "user@test.com",
            isActive: true,
            isVerified: true,
            nickName: "Test User",
            passwordHash: HASHED_PASSWORD,
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.valid).toBe(true);
      expect(result.user.id).toBe(TEST_USER_ID);
      expect(result.user.email).toBe("user@test.com");
      expect(result.user.nickName).toBe("Test User");
      expect(result.user.isActive).toBe(true);
      expect(result.user.isVerified).toBe(true);
      expect(result.user).not.toHaveProperty("passwordHash");
    },
  });

  defineTest({
    name: "should throw 401 for invalid token",
    action: verifyTokenAction,
    params: { token: "invalid.token.string" },
    db: () => testDs,
    expectError: "Invalid or expired token",
  });

  defineTest({
    name: "should throw 401 when user not found",
    action: verifyTokenAction,
    params: {
      token: jwt.sign(
        { userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        JWT_SECRET,
      ),
    },
    db: () => testDs,
    expectError: "User not found",
  });

  defineTest({
    name: "should throw 403 when account is disabled",
    action: verifyTokenAction,
    params: {
      token: jwt.sign({ userId: TEST_USER_ID }, JWT_SECRET),
    },
    db: () => testDs,
    before: [
      {
        entity: User,
        data: [
          {
            id: TEST_USER_ID,
            email: "disabled@test.com",
            isActive: false,
            isVerified: true,
            nickName: "Disabled User",
            passwordHash: HASHED_PASSWORD,
          },
        ],
      },
    ],
    expectError: "Account is disabled",
  });
});
