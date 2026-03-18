/**
 * Delete Conversation Action
 *
 * Delete a conversation with cascade deletion of ChatMessages and AILogs.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { AILog } from "core.lib/database";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { ChatMessage } from "../../db/chat-message.entity";
import { Conversation } from "../../db/conversation.entity";
import { Session } from "../../db/session.entity";

export interface DeleteConversationParams {
  id: string;
}

export default defineAction<DeleteConversationParams, unknown>({
  authentication: true,
  rest: "DELETE /:id",

  params: {
    id: { type: "uuid" },
  },

  async handler(ctx: AuthenticatedContext<DeleteConversationParams>) {
    const { id } = ctx.params;
    const convRepo = dataSource.getRepository(Conversation);

    const conversation = await convRepo.findOneBy({ id });
    if (!conversation) {
      throw new Errors.MoleculerClientError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
        { id },
      );
    }

    // Verify session belongs to the authenticated user
    const sessionRepo = dataSource.getRepository(Session);
    const session = await sessionRepo.findOneBy({
      id: conversation.sessionId,
      userId: ctx.meta.user.id,
    });
    if (!session) {
      throw new Errors.MoleculerClientError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
        { id },
      );
    }

    // Cascade delete
    await dataSource.getRepository(ChatMessage).delete({ conversationId: id });
    await dataSource.getRepository(AILog).delete({ conversationId: id });
    await convRepo.remove(conversation);

    // Update session conversation count
    try {
      await sessionRepo.decrement(
        { id: conversation.sessionId },
        "conversationCount",
        1,
      );
    } catch {
      // Non-critical
    }

    return { success: true, id };
  },
});
