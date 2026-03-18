/**
 * Get History Action
 *
 * Retrieve paginated conversation message history in chronological order.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { ChatMessage, MessageRole } from "../../db/chat-message.entity";
import { Conversation } from "../../db/conversation.entity";

export interface GetHistoryParams {
  conversationId: string;
  page?: number;
  limit?: number;
  excludeSystem?: boolean;
}

export interface GetHistoryResult {
  messages: Array<{
    citedSources: unknown | null;
    confidenceScore: number | null;
    content: string;
    conversationId: string;
    createdAt: Date;
    id: string;
    promptStats: unknown | null;
    reasoningSteps: string[] | null;
    role: string;
    toolsUsed: unknown | null;
  }>;
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export default defineAction<GetHistoryParams, GetHistoryResult>({
  authentication: true,
  rest: "GET /messages",

  params: {
    conversationId: { type: "uuid" },
    page: {
      type: "number",
      convert: true,
      integer: true,
      min: 1,
      optional: true,
      default: 1,
    },
    limit: {
      type: "number",
      convert: true,
      integer: true,
      min: 1,
      max: 100,
      optional: true,
      default: 50,
    },
    excludeSystem: {
      type: "boolean",
      convert: true,
      optional: true,
      default: false,
    },
  },

  async handler(ctx: AuthenticatedContext<GetHistoryParams>) {
    const {
      conversationId,
      page = 1,
      limit = 50,
      excludeSystem = false,
    } = ctx.params;
    const convRepo = dataSource.getRepository(Conversation);
    const msgRepo = dataSource.getRepository(ChatMessage);

    // Verify conversation exists
    const conversation = await convRepo.findOneBy({ id: conversationId });
    if (!conversation) {
      throw new Errors.MoleculerClientError(
        "Conversation not found",
        404,
        "CONVERSATION_NOT_FOUND",
        { id: conversationId },
      );
    }

    const qb = msgRepo
      .createQueryBuilder("msg")
      .where("msg.conversationId = :conversationId", { conversationId })
      .orderBy("msg.createdAt", "ASC");

    if (excludeSystem) {
      qb.andWhere("msg.role != :systemRole", {
        systemRole: MessageRole.SYSTEM,
      });
    }

    const total = await qb.getCount();

    const messages = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      messages: messages.map((m) => ({
        citedSources: m.citedSources,
        confidenceScore: m.confidenceScore,
        content: m.content,
        conversationId: m.conversationId,
        createdAt: m.createdAt,
        id: m.id,
        promptStats: m.promptStats,
        reasoningSteps: m.reasoningSteps,
        role: m.role,
        toolsUsed: m.toolsUsed,
      })),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  },
});
