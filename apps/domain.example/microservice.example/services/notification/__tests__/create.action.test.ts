/**
 * Tests for notification/create.action.ts
 */

import { defineTest } from "core.lib/testing";
import createAction from "../create.action";

describe("notification.create action", () => {
  defineTest({
    name: "should return success with default response",
    action: createAction,
    params: {},
    assertResult: (result) => {
      expect(result.success).toBe(true);
      expect(result.message).toBe("notification.create completed");
    },
  });

  defineTest({
    name: "should accept optional id parameter",
    action: createAction,
    params: { id: "notif-123" },
    assertResult: (result) => {
      expect(result.success).toBe(true);
    },
  });
});
