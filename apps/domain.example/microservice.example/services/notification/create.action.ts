/**
 * Create Notification Action
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";

export interface CreateNotificationParams {
  // TODO: Define params
  id?: string;
}

export interface CreateNotificationResult {
  // TODO: Define result
  success: boolean;
  message: string;
}

export default defineAction<CreateNotificationParams, CreateNotificationResult>(
  {
    params: {
      id: { type: "string", optional: true },
    },

    async handler(ctx: TypedContext<CreateNotificationParams>) {
      const { id } = ctx.params;

      // TODO: Implement action logic
      console.log(`notification.create called with id: ${id}`);

      return {
        success: true,
        message: "notification.create completed",
      };
    },
  },
);
