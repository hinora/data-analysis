/**
 * Tests for notification/list.action.ts
 */

import { defineTest } from "core.lib/testing";
import listAction from "../list.action";

describe("notification.list action", () => {
  defineTest({
    name: "should return success with default response",
    action: listAction,
    params: {},
    assertResult: (result) => {
      expect(result.success).toBe(true);
      expect(result.message).toBe("notification.list completed");
    },
  });

  defineTest({
    name: "should accept optional id parameter",
    action: listAction,
    params: { id: "notif-456" },
    assertResult: (result) => {
      expect(result.success).toBe(true);
    },
  });
});
