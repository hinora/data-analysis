/**
 * Tests for user/list.action.ts
 */

import { defineTest } from "core.lib/testing";
import listAction from "../list.action";

describe("user.list action", () => {
  defineTest({
    name: "should return success with default response",
    action: listAction,
    params: {},
    assertResult: (result) => {
      expect(result.success).toBe(true);
      expect(result.message).toBe("user.list completed");
    },
  });

  defineTest({
    name: "should accept optional id parameter",
    action: listAction,
    params: { id: "user-123" },
    assertResult: (result) => {
      expect(result.success).toBe(true);
    },
  });

  defineTest({
    name: "should have proper action schema",
    action: listAction,
    params: {},
    assertResult: () => {
      expect(listAction.params).toEqual({
        id: { type: "string", optional: true },
      });
    },
  });
});
