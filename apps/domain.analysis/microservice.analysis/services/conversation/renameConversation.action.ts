/**
 * Rename Conversation Action
 *
 * Rename a conversation with validation.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Conversation } from "../../db/conversation.entity";
import { Session } from "../../db/session.entity";

export interface RenameConversationParams {
  id: string;
  name: string;
}

export default defineAction<RenameConversationParams, unknown>({
  authentication: true,
  rest: "PATCH /:id/rename",

  params: {
    id: { type: "uuid" },
    name: { type: "string", min: 1, max: 500 },
  },

  async handler(ctx: AuthenticatedContext<RenameConversationParams>) {
    const { id, name } = ctx.params;
    const repo = dataSource.getRepository(Conversation);

    const conversation = await repo.findOneBy({ id });
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

    conversation.name = name.trim();
    const saved = await repo.save(conversation);

    return saved;
  },
});
