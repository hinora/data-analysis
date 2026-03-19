/**
 * Create Conversation Action
 *
 * Creates a new conversation within a session. Constructs a system prompt
 * from the session's datasets (schemas, column mappings, AI metadata,
 * tool definitions, mission statement, response format rules).
 * The system prompt is stored as the first ChatMessage and on the Conversation.
 */

import type { AuthenticatedContext } from "core.lib/broker";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Conversation } from "../../db/conversation.entity";
import { Session } from "../../db/session.entity";

export interface CreateConversationParams {
  sessionId: string;
  name?: string;
}

export interface CreateConversationResult {
  id: string;
  sessionId: string;
  name: string;
  systemPrompt: string;
  messageCount: number;
  createdAt: Date;
}

function generateConversationName(): string {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    hour12: false,
  });
  return `Conversation — ${formatted}`;
}

export default defineAction<CreateConversationParams, CreateConversationResult>(
  {
    authentication: true,
    rest: "POST /",

    params: {
      sessionId: { type: "uuid" },
      name: { type: "string", optional: true, min: 1, max: 500 },
    },

    async handler(ctx: AuthenticatedContext<CreateConversationParams>) {
      const { sessionId } = ctx.params;
      const sessionRepo = dataSource.getRepository(Session);
      const convRepo = dataSource.getRepository(Conversation);

      // Verify session exists
      const session = await sessionRepo.findOneBy({ id: sessionId, userId: ctx.meta.user.id });
      if (!session) {
        throw new Errors.MoleculerClientError(
          "Session not found",
          404,
          "SESSION_NOT_FOUND",
          { id: sessionId },
        );
      }

      // Create conversation
      const conversation = convRepo.create({
        sessionId,
        messageCount: 0,
        name: ctx.params.name || generateConversationName(),
        systemPrompt: "",
      });
      const saved = await convRepo.save(conversation);

      // Update session status and conversation count
      try {
        await ctx.call("session.updateSessionStatus", {
          sessionId,
          trigger: "conversation-created",
        });
      } catch (err) {
        ctx.broker.logger.warn(
          "Failed to update session conversation count:",
          err,
        );
      }

      ctx.broker.logger.info(
        `Conversation created: ${saved.id} in session ${sessionId}`,
      );

      return {
        id: saved.id,
        sessionId: saved.sessionId,
        name: saved.name,
        systemPrompt: saved.systemPrompt,
        messageCount: saved.messageCount,
        createdAt: saved.createdAt,
      };
    },
  },
);
