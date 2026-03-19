/**
 * Verify Session Ownership Action
 *
 * Internal action that checks whether a session belongs to a given user.
 * Throws 404 if the session does not exist or does not belong to the user.
 * Used by other microservices to enforce ownership before accessing resources.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Session } from "../../db/session.entity";

export interface VerifySessionOwnershipParams {
  sessionId: string;
  userId: string;
}

export interface VerifySessionOwnershipResult {
  sessionId: string;
  userId: string;
}

export default defineAction<
  VerifySessionOwnershipParams,
  VerifySessionOwnershipResult
>({
  params: {
    sessionId: { type: "uuid" },
    userId: { type: "uuid" },
  },

  async handler(ctx: TypedContext<VerifySessionOwnershipParams>) {
    const { sessionId, userId } = ctx.params;
    const repo = dataSource.getRepository(Session);

    const session = await repo.findOneBy({ id: sessionId, userId });

    if (!session) {
      throw new Errors.MoleculerClientError(
        "Session not found",
        404,
        "SESSION_NOT_FOUND",
        { id: sessionId },
      );
    }

    return { sessionId, userId };
  },
});
