/**
 * Verify Conversation Ownership Action
 *
 * Internal action that checks whether a conversation belongs to a given user
 * (via session ownership). Throws 404 if the conversation does not exist or
 * its session does not belong to the user.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Conversation } from "../../db/conversation.entity";
import { Session } from "../../db/session.entity";

export interface VerifyConversationOwnershipParams {
  conversationId: string;
  userId: string;
}

export interface VerifyConversationOwnershipResult {
  conversationId: string;
  sessionId: string;
  userId: string;
}

export default defineAction<
  VerifyConversationOwnershipParams,
  VerifyConversationOwnershipResult
>({
  params: {
    conversationId: { type: "uuid" },
    userId: { type: "uuid" },
  },

  async handler(ctx: TypedContext<VerifyConversationOwnershipParams>) {
    const { conversationId, userId } = ctx.params;
    const convRepo = dataSource.getRepository(Conversation);

    const conversation = await convRepo.findOneBy({ id: conversationId });
    if (!conversation) {
      throw new Errors.MoleculerClientError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
        { id: conversationId },
      );
    }

    const sessionRepo = dataSource.getRepository(Session);
    const session = await sessionRepo.findOneBy({
      id: conversation.sessionId,
      userId,
    });
    if (!session) {
      throw new Errors.MoleculerClientError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
        { id: conversationId },
      );
    }

    return {
      conversationId,
      sessionId: conversation.sessionId,
      userId,
    };
  },
});
