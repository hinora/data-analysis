/**
 * Rename Conversation Action
 *
 * Rename a conversation with validation.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Conversation } from "../../db/conversation.entity";

export interface RenameConversationParams {
  id: string;
  name: string;
}

export default defineAction<RenameConversationParams, unknown>({
  rest: "PATCH /:id/rename",

  params: {
    id: { type: "uuid" },
    name: { type: "string", min: 1, max: 500 },
  },

  async handler(ctx: TypedContext<RenameConversationParams>) {
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

    conversation.name = name.trim();
    const saved = await repo.save(conversation);

    return saved;
  },
});
