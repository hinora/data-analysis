/**
 * Get Conversation Action
 *
 * Return full conversation details including system prompt.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { ChatMessage, MessageRole } from "../../db/chat-message.entity";
import { Conversation } from "../../db/conversation.entity";

export interface GetConversationParams {
  id: string;
}

export default defineAction<GetConversationParams, unknown>({
  rest: "GET /:id",

  params: {
    id: { type: "uuid" },
  },

  async handler(ctx: TypedContext<GetConversationParams>) {
    const { id } = ctx.params;
    const convRepo = dataSource.getRepository(Conversation);
    const msgRepo = dataSource.getRepository(ChatMessage);

    const conversation = await convRepo.findOneBy({ id });
    if (!conversation) {
      throw new Errors.MoleculerClientError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
        { id },
      );
    }

    // Get system prompt from first message
    const systemMessage = await msgRepo.findOne({
      where: { conversationId: id, role: MessageRole.SYSTEM },
      order: { createdAt: "ASC" },
    });

    return {
      ...conversation,
      systemPrompt: systemMessage?.content || conversation.systemPrompt,
    };
  },
});
