/**
 * Tests for auth/register.action.ts
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
      email: "newuser@test.com",
      nickName: "New User",
      password: "password123",
    },
    db: () => testDs,
    assertResult: (result) => {
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe("string");
      expect(result.token.length).toBeGreaterThan(0);
      expect(result.user.email).toBe("newuser@test.com");
      expect(result.user.nickName).toBe("New User");
      expect(result.user.isActive).toBe(true);
      expect(result.user.isVerified).toBe(false);
      expect(result.user).not.toHaveProperty("passwordHash");
    },
  });

  defineTest({
    name: "should throw 409 when email already exists",
    action: registerAction,
    params: {
      email: "existing@test.com",
      nickName: "Another User",
      password: "password123",
    },
    db: () => testDs,
    before: [
      {
        entity: User,
        data: [
          {
            email: "existing@test.com",
            isActive: true,
            isVerified: false,
            nickName: "Existing User",
            passwordHash: bcrypt.hashSync("password123", 10),
          },
        ],
      },
    ],
    expectError: "Email already registered",
  });

  defineTest({
    name: "should hash the password",
    action: registerAction,
    params: {
      email: "hashtest@test.com",
      nickName: "Hash Test",
      password: "plainTextPassword",
    },
    db: () => testDs,
    after: async (ds) => {
      const repo = ds.getRepository(User);
      const users = await repo.find();
      expect(users).toHaveLength(1);
      expect(users[0].passwordHash).toBeDefined();
      expect(users[0].passwordHash).not.toBe("plainTextPassword");
      const isMatch = await bcrypt.compare(
        "plainTextPassword",
        users[0].passwordHash,
      );
      expect(isMatch).toBe(true);
    },
  });
});
