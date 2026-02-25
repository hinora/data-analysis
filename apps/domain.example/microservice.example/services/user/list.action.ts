/**
 * List User Action
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";

export interface ListUserParams {
  // TODO: Define params
  id?: string;
}

export interface ListUserResult {
  // TODO: Define result
  success: boolean;
  message: string;
}

export default defineAction<ListUserParams, ListUserResult>({
  params: {
    id: { type: "string", optional: true },
  },

  async handler(ctx: TypedContext<ListUserParams>) {
    const { id } = ctx.params;

    // TODO: Implement action logic
    console.log(`user.list called with id: ${id}`);

    return {
      success: true,
      message: "user.list completed",
    };
  },
});
