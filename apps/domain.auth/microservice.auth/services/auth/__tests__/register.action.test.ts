/**
 * Tests for auth/register.action.ts
 */

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

import registerAction from "../register.action";

beforeAll(async () => {
  testDs = await createTestDataSource([User]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [User]);
});

describe("auth.register action", () => {
  defineTest({
    name: "should register a new user and return token",
    action: registerAction,
    params: {
      email: "test@example.com",
      nickName: "Test User",
      password: "password123",
    },
    db: () => testDs,
    assertResult: (result) => {
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.nickName).toBe("Test User");
      expect(result.user.isActive).toBe(true);
      expect(result.user.isVerified).toBe(false);
      expect(result.user.id).toBeDefined();
    },
    after: [
      {
        entity: User,
        assert: (users) => {
          expect(users).toHaveLength(1);
          expect(users[0].email).toBe("test@example.com");
          // Password should be hashed, not plain text
          expect(users[0].password).not.toBe("password123");
          expect(users[0].password).toMatch(/^\$2[aby]?\$/);
        },
      },
    ],
  });

  defineTest({
    name: "should reject duplicate email",
    action: registerAction,
    params: {
      email: "existing@example.com",
      nickName: "New User",
      password: "password123",
    },
    db: () => testDs,
    before: async (ds) => {
      const bcrypt = await import("bcryptjs");
      const repo = ds.getRepository(User);
      await repo.save(
        repo.create({
          email: "existing@example.com",
          nickName: "Existing",
          password: await bcrypt.hash("oldpass", 10),
        }),
      );
    },
    expectError: "A user with this email already exists",
  });

  defineTest({
    name: "should have correct REST config",
    action: registerAction,
    params: {
      email: "schema@test.com",
      nickName: "Schema",
      password: "password123",
    },
    db: () => testDs,
    assertResult: () => {
      expect(registerAction.rest).toBe("POST /register");
      expect(registerAction.params).toBeDefined();
    },
  });
});
