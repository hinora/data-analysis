/**
 * Tests for user/create.action.ts
 */

import { defineTest } from "core.lib/testing";
import createAction from "../create.action";

describe("user.create action", () => {
  defineTest({
    name: "should create a user and emit user.created event",
    action: createAction,
    params: { email: "john@example.com", name: "John Doe" },
    assertResult: (result) => {
      expect(result.email).toBe("john@example.com");
      expect(result.name).toBe("John Doe");
      expect(result.id).toMatch(/^user-/);
      expect(result.createdAt).toBeInstanceOf(Date);
    },
  });

  defineTest({
    name: "should generate unique IDs for different users",
    action: createAction,
    params: { email: "alice@example.com", name: "Alice" },
    assertResult: async (result1) => {
      // Create a second user and compare IDs
      const { createTestContext } = await import("core.lib/testing");
      const ctx2 = createTestContext({
        params: { email: "bob@example.com", name: "Bob" },
      });
      await new Promise((r) => setTimeout(r, 5));
      const result2 = await createAction.handler(ctx2);
      expect(result1.id).not.toBe(result2.id);
    },
  });

  defineTest({
    name: "should have proper action schema",
    action: createAction,
    params: { email: "test@test.com", name: "Test" },
    assertResult: () => {
      expect(createAction.params).toEqual({
        email: { type: "email" },
        name: { type: "string", min: 2 },
      });
    },
  });
});
