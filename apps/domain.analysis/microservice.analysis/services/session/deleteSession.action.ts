/**
 * Delete Session Action
 *
 * Removes a session and emits sessionData.sessionDeleted event for cross-service cascade.
 * The data microservice listens for this event to delete datasets, records, chunks, etc.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Session } from "../../db/session.entity";

export interface DeleteSessionParams {
  id: string;
}

export interface DeleteSessionResult {
  success: boolean;
  id: string;
}

export default defineAction<DeleteSessionParams, DeleteSessionResult>({
  rest: "DELETE /:id",

  params: {
    id: { type: "uuid" },
  },

  async handler(ctx: TypedContext<DeleteSessionParams>) {
    const repo = dataSource.getRepository(Session);

    const session = await repo.findOneBy({ id: ctx.params.id });

    if (!session) {
      throw new Errors.MoleculerClientError(
        "Session not found",
        404,
        "SESSION_NOT_FOUND",
        { id: ctx.params.id },
      );
    }

    // Delete the session (cascades to conversations and chat messages via FK)
    await repo.remove(session);

    // Emit event for cross-service cascade (data microservice cleans up datasets, files, etc.)
    await ctx.emit("sessionData.sessionDeleted", {
      sessionId: ctx.params.id,
    });

    ctx.broker.logger.info(`Session deleted: ${ctx.params.id}`);

    return {
      success: true,
      id: ctx.params.id,
    };
  },
});
