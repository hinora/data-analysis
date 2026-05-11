/**
 * Tests for auth/login.action.ts
 */

import bcrypt from "bcryptjs";
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
  User: require("../../../db/user.entity").User,
  get dataSource() {
    return testDs;
  },
}));

import loginAction from "../login.action";

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

describe("auth.login action", () => {
  defineTest({
    name: "should login with valid credentials",
    action: loginAction,
    params: { email: "test@example.com", password: "password123" },
    db: () => testDs,
    before: async (ds) => {
      const repo = ds.getRepository(User);
      await repo.save(
        repo.create({
          email: "test@example.com",
          id: USER_ID,
          isActive: true,
          nickName: "Test User",
          password: await bcrypt.hash("password123", 10),
        }),
      );
    },
    assertResult: (result) => {
      expect(result.token).toBeDefined();
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.id).toBe(USER_ID);
    },
  });

  defineTest({
    name: "should reject invalid email",
    action: loginAction,
    params: { email: "wrong@example.com", password: "password123" },
    db: () => testDs,
    expectError: "Invalid email or password",
  });

  defineTest({
    name: "should reject wrong password",
    action: loginAction,
    params: { email: "test@example.com", password: "wrongpassword" },
    db: () => testDs,
    before: async (ds) => {
      const repo = ds.getRepository(User);
      await repo.save(
        repo.create({
          email: "test@example.com",
          isActive: true,
          nickName: "Test",
          password: await bcrypt.hash("password123", 10),
        }),
      );
    },
    expectError: "Invalid email or password",
  });

  defineTest({
    name: "should reject inactive account",
    action: loginAction,
    params: { email: "inactive@example.com", password: "password123" },
    db: () => testDs,
    before: async (ds) => {
      const repo = ds.getRepository(User);
      await repo.save(
        repo.create({
          email: "inactive@example.com",
          isActive: false,
          nickName: "Inactive",
          password: await bcrypt.hash("password123", 10),
        }),
      );
    },
    expectError: "Account is deactivated",
  });
});
