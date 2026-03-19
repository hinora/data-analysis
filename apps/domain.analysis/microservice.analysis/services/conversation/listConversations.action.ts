/**
 * List Conversations Action
 *
 * Returns conversations for a session with summary metadata.
 */

import type { AuthenticatedContext } from "core.lib/broker";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { Conversation } from "../../db/conversation.entity";

export interface ListConversationsParams {
  sessionId: string;
}

export default defineAction<ListConversationsParams, Conversation[]>({
  authentication: true,
  rest: "GET /",

  params: {
    sessionId: { type: "uuid" },
  },

  async handler(ctx: AuthenticatedContext<ListConversationsParams>) {
    // Verify session ownership
    await ctx.call("session.verifySessionOwnership", {
      sessionId: ctx.params.sessionId,
      userId: ctx.meta.user.id,
    });

    const repo = dataSource.getRepository(Conversation);

    const conversations = await repo.find({
      where: { sessionId: ctx.params.sessionId },
      order: { createdAt: "DESC" },
      select: [
        "id",
        "sessionId",
        "name",
        "messageCount",
        "createdAt",
        "updatedAt",
      ],
    });

    return conversations;
  },
});
