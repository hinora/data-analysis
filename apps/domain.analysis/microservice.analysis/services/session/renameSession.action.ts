/**
 * Rename Session Action
 *
 * Updates a session's name. Name must be 1–200 characters.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Session } from "../../db/session.entity";

export interface RenameSessionParams {
  id: string;
  name: string;
}

export default defineAction<RenameSessionParams, Session>({
  authentication: true,
  rest: "PATCH /:id/rename",

  params: {
    id: { type: "uuid" },
    name: { type: "string", min: 1, max: 200 },
  },

  async handler(ctx: AuthenticatedContext<RenameSessionParams>) {
    const repo = dataSource.getRepository(Session);

    const session = await repo.findOneBy({
      id: ctx.params.id,
      userId: ctx.meta.user.id,
    });

    if (!session) {
      throw new Errors.MoleculerClientError(
        "Session not found",
        404,
        "SESSION_NOT_FOUND",
        { id: ctx.params.id },
      );
    }

    session.name = ctx.params.name;
    const updated = await repo.save(session);

    ctx.broker.logger.info(`Session renamed: ${updated.id} → ${updated.name}`);

    return updated;
  },
});
