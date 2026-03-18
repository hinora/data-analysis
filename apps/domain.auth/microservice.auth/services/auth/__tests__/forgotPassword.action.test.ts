/**
 * Tests for auth/forgotPassword.action.ts
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

import forgotPasswordAction from "../forgotPassword.action";

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

describe("auth.forgotPassword action", () => {
  defineTest({
    name: "should return success even when email does not exist",
    action: forgotPasswordAction,
    params: { email: "nonexistent@test.com" },
    db: () => testDs,
    assertResult: (result) => {
      expect(result.success).toBe(true);
    },
  });

  defineTest({
    name: "should generate reset token for existing user",
    action: forgotPasswordAction,
    params: { email: "user@test.com" },
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
      expect(result.success).toBe(true);
    },
    after: async (ds) => {
      const repo = ds.getRepository(User);
      const user = await repo.findOneBy({ id: TEST_USER_ID });
      expect(user).toBeDefined();
      expect(user!.resetToken).toBeDefined();
      expect(user!.resetToken).not.toBeNull();
      expect(typeof user!.resetToken).toBe("string");
      expect(user!.resetToken!.length).toBeGreaterThan(0);
      expect(user!.resetTokenExpiry).toBeDefined();
      expect(user!.resetTokenExpiry).not.toBeNull();
      expect(user!.resetTokenExpiry!.getTime()).toBeGreaterThan(Date.now());
    },
  });
});
