/**
 * List Conversations Action
 *
 * Returns conversations for a session with summary metadata.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { Conversation } from "../../db/conversation.entity";

export interface ListConversationsParams {
  sessionId: string;
}

export default defineAction<ListConversationsParams, Conversation[]>({
  rest: "GET /",

  params: {
    sessionId: { type: "uuid" },
  },

  async handler(ctx: TypedContext<ListConversationsParams>) {
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
