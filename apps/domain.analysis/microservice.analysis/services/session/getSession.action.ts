/**
 * Get Session Action
 *
 * Returns full session details by ID.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Session } from "../../db/session.entity";

export interface GetSessionParams {
  id: string;
}

export default defineAction<GetSessionParams, Session>({
  rest: "GET /:id",

  params: {
    id: { type: "uuid" },
  },

  async handler(ctx: TypedContext<GetSessionParams>) {
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

    return session;
  },
});
