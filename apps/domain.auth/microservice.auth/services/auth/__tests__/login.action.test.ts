/**
 * Tests for auth/login.action.ts
 */

import * as bcrypt from "bcryptjs";
import {
  clearTestDatabase,
  createTestDataSource,
  defineTest,
  destroyTestDataSource,
} from "core.lib/testing";
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

import loginAction from "../login.action";

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

describe("auth.login action", () => {
  defineTest({
    name: "should login with valid credentials",
    action: loginAction,
    params: { email: "user@test.com", password: "testPassword123" },
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
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");
      expect(result.token.length).toBeGreaterThan(0);
      expect(result.user.id).toBe(TEST_USER_ID);
      expect(result.user.email).toBe("user@test.com");
      expect(result.user.nickName).toBe("Test User");
      expect(result.user.isActive).toBe(true);
      expect(result.user.isVerified).toBe(true);
      expect(result.user).not.toHaveProperty("passwordHash");
    },
  });

  defineTest({
    name: "should throw 401 with wrong email",
    action: loginAction,
    params: { email: "nonexistent@test.com", password: "testPassword123" },
    db: () => testDs,
    expectError: "Invalid email or password",
  });

  defineTest({
    name: "should throw 401 with wrong password",
    action: loginAction,
    params: { email: "user@test.com", password: "wrongPassword123" },
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
    expectError: "Invalid email or password",
  });

  defineTest({
    name: "should throw 403 when account is disabled",
    action: loginAction,
    params: { email: "disabled@test.com", password: "testPassword123" },
    db: () => testDs,
    before: [
      {
        entity: User,
        data: [
          {
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
