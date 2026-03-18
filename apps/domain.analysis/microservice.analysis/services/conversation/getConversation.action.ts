/**
 * Get Conversation Action
 *
 * Return full conversation details including system prompt.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Conversation } from "../../db/conversation.entity";

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
