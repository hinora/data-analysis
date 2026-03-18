/**
 * Create Session Action
 *
 * Creates a new analysis session. If no name is provided, auto-generates
 * one in the format "Session — MMM DD, YYYY HH:mm".
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { Session, SessionStatus } from "../../db/session.entity";

export interface CreateSessionParams {
  name?: string;
}

export interface CreateSessionResult {
  id: string;
  name: string;
  status: SessionStatus;
  userId: string;
  datasetCount: number;
  conversationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function generateSessionName(): string {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
    hour12: false,
  });
  return `Session — ${formatted}`;
}

export default defineAction<CreateSessionParams, CreateSessionResult>({
  authentication: true,
  rest: "POST /",

  params: {
    name: { type: "string", optional: true, min: 1, max: 200 },
  },

  async handler(ctx: AuthenticatedContext<CreateSessionParams>) {
    const repo = dataSource.getRepository(Session);

    const session = repo.create({
      name: ctx.params.name || generateSessionName(),
      status: SessionStatus.EMPTY,
      userId: ctx.meta.user.id,
      datasetCount: 0,
      conversationCount: 0,
    });

    const saved = await repo.save(session);

    ctx.broker.logger.info(`Session created: ${saved.id} (${saved.name})`);

    return saved;
  },
});
