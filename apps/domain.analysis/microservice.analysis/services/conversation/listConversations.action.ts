/**
 * List Conversations Action
 *
 * Returns conversations for a session with summary metadata.
 */

import type { AuthenticatedContext } from "core.lib/broker";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Conversation } from "../../db/conversation.entity";
import { Session } from "../../db/session.entity";

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
    const sessionRepo = dataSource.getRepository(Session);
    const session = await sessionRepo.findOneBy({
      id: ctx.params.sessionId,
      userId: ctx.meta.user.id,
    });
    if (!session) {
      throw new Errors.MoleculerClientError(
        "Session not found",
        404,
        "SESSION_NOT_FOUND",
        { id: ctx.params.sessionId },
      );
    }

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
