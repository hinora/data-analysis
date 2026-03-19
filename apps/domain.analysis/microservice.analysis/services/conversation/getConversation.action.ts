/**
 * Get Conversation Action
 *
 * Return full conversation details including system prompt.
 */

import type { AuthenticatedContext } from "core.lib/broker";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Conversation } from "../../db/conversation.entity";
import { Session } from "../../db/session.entity";

export interface GetConversationParams {
  id: string;
}

export default defineAction<GetConversationParams, unknown>({
  authentication: true,
  rest: "GET /:id",

  params: {
    id: { type: "uuid" },
  },

  async handler(ctx: AuthenticatedContext<GetConversationParams>) {
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

    // Verify session ownership
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

    const promptResult = (await ctx.call("chat.buildDynamicSystemPrompt", {
      sessionId: conversation.sessionId,
    })) as { systemPrompt: string };
    const { systemPrompt } = promptResult;

    await convRepo.update({ id }, { systemPrompt });

    return {
      ...conversation,
      systemPrompt,
    };
  },
});
