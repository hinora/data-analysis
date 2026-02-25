/**
 * List Notification Action
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";

export interface ListNotificationParams {
  // TODO: Define params
  id?: string;
}

export interface ListNotificationResult {
  // TODO: Define result
  success: boolean;
  message: string;
}

export default defineAction<ListNotificationParams, ListNotificationResult>({
  params: {
    id: { type: "string", optional: true },
  },

  async handler(ctx: TypedContext<ListNotificationParams>) {
    const { id } = ctx.params;

    // TODO: Implement action logic
    console.log(`notification.list called with id: ${id}`);

    return {
      success: true,
      message: "notification.list completed",
    };
  },
});
