/**
 * Tests for auth/updateProfile.action.ts
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

import updateProfileAction from "../updateProfile.action";

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

const TEST_META = {
  user: {
    email: "test@example.com",
    id: USER_ID,
    isActive: true,
    isVerified: false,
    nickName: "Old Name",
  },
};

describe("auth.updateProfile action", () => {
  defineTest({
    name: "should update nickName",
    action: updateProfileAction,
    params: { nickName: "New Name" },
    meta: TEST_META,
    db: () => testDs,
    before: [
      {
        entity: User,
        data: [
          {
            email: "test@example.com",
            id: USER_ID,
            isActive: true,
            nickName: "Old Name",
            password: "hashed",
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.nickName).toBe("New Name");
      expect(result.id).toBe(USER_ID);
      expect(result.email).toBe("test@example.com");
    },
    after: [
      {
        entity: User,
        assert: (users) => {
          expect(users).toHaveLength(1);
          expect(users[0].nickName).toBe("New Name");
        },
      },
    ],
  });

  defineTest({
    name: "should update photo",
    action: updateProfileAction,
    params: { photo: "https://example.com/photo.jpg" },
    meta: TEST_META,
    db: () => testDs,
    before: [
      {
        entity: User,
        data: [
          {
            email: "test@example.com",
            id: USER_ID,
            isActive: true,
            nickName: "Old Name",
            password: "hashed",
          },
        ],
      },
    ],
    assertResult: (result) => {
      expect(result.photo).toBe("https://example.com/photo.jpg");
      expect(result.id).toBe(USER_ID);
    },
    after: [
      {
        entity: User,
        assert: (users) => {
          expect(users[0].photo).toBe("https://example.com/photo.jpg");
        },
      },
    ],
  });

  defineTest({
    name: "should throw 404 when user not found",
    action: updateProfileAction,
    params: { nickName: "New" },
    meta: {
      user: {
        email: "ghost@example.com",
        id: "00000000-0000-4000-8000-000000000000",
        isActive: true,
        isVerified: false,
        nickName: "Ghost",
      },
    },
    db: () => testDs,
    expectError: "User not found",
  });
});
