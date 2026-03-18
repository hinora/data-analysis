/**
 * Tests for auth/resetPassword.action.ts
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

import resetPasswordAction from "../resetPassword.action";

const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HASHED_PASSWORD = bcrypt.hashSync("oldPassword123", 10);
const VALID_RESET_TOKEN =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

beforeAll(async () => {
  testDs = await createTestDataSource([User]);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, [User]);
});

describe("auth.resetPassword action", () => {
  defineTest({
    name: "should reset password with valid token",
    action: resetPasswordAction,
    params: { password: "newPassword456", token: VALID_RESET_TOKEN },
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
            resetToken: VALID_RESET_TOKEN,
            resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.success).toBe(true);
      expect(result.message).toBe("Password has been reset successfully");
    },
    after: async (ds) => {
      const repo = ds.getRepository(User);
      const user = await repo.findOneBy({ id: TEST_USER_ID });
      expect(user).toBeDefined();
      // Password hash should have changed
      expect(user!.passwordHash).not.toBe(HASHED_PASSWORD);
      const isMatch = await bcrypt.compare(
        "newPassword456",
        user!.passwordHash,
      );
      expect(isMatch).toBe(true);
      // Reset token fields should be cleared
      expect(user!.resetToken).toBeNull();
      expect(user!.resetTokenExpiry).toBeNull();
    },
  });

  defineTest({
    name: "should throw 400 for invalid reset token",
    action: resetPasswordAction,
    params: { password: "newPassword456", token: "nonexistent-token" },
    db: () => testDs,
    expectError: "Invalid or expired reset token",
  });

  defineTest({
    name: "should throw 400 for expired reset token",
    action: resetPasswordAction,
    params: { password: "newPassword456", token: VALID_RESET_TOKEN },
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
            resetToken: VALID_RESET_TOKEN,
            resetTokenExpiry: new Date(Date.now() - 60 * 60 * 1000),
          },
        ],
      },
    ],
    expectError: "Invalid or expired reset token",
  });
});
