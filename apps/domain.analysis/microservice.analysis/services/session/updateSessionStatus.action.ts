/**
 * Update Session Status Action
 *
 * Internal action for session status transitions:
 *   empty → has-data    (when first dataset is imported)
 *   has-data → active   (when first conversation is created)
 *
 * Called by event handlers in response to metadata.generateMetadata and conversation creation.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Session, SessionStatus } from "../../db/session.entity";

export interface UpdateSessionStatusParams {
  sessionId: string;
  trigger: "dataset-imported" | "conversation-created" | "dataset-deleted";
}

export interface UpdateSessionStatusResult {
  id: string;
  previousStatus: SessionStatus;
  newStatus: SessionStatus;
  changed: boolean;
}

export default defineAction<
  UpdateSessionStatusParams,
  UpdateSessionStatusResult
>({
  params: {
    sessionId: { type: "uuid" },
    trigger: {
      type: "enum",
      values: ["dataset-imported", "conversation-created", "dataset-deleted"],
    },
  },

  async handler(ctx: TypedContext<UpdateSessionStatusParams>) {
    const repo = dataSource.getRepository(Session);

    const session = await repo.findOneBy({ id: ctx.params.sessionId });

    if (!session) {
      throw new Errors.MoleculerClientError(
        "Session not found",
        404,
        "SESSION_NOT_FOUND",
        { id: ctx.params.sessionId },
      );
    }

    const previousStatus = session.status;
    let changed = false;

    if (ctx.params.trigger === "dataset-imported") {
      // empty → has-data on first dataset import
      if (session.status === SessionStatus.EMPTY) {
        session.status = SessionStatus.HAS_DATA;
        session.datasetCount = (session.datasetCount || 0) + 1;
        changed = true;
      } else {
        // Just increment dataset count
        session.datasetCount = (session.datasetCount || 0) + 1;
        changed = true;
      }
    } else if (ctx.params.trigger === "conversation-created") {
      // has-data → active on first conversation
      if (session.status === SessionStatus.HAS_DATA) {
        session.status = SessionStatus.ACTIVE;
        session.conversationCount = (session.conversationCount || 0) + 1;
        changed = true;
      } else if (session.status === SessionStatus.ACTIVE) {
        // Just increment conversation count
        session.conversationCount = (session.conversationCount || 0) + 1;
        changed = true;
      }
    } else if (ctx.params.trigger === "dataset-deleted") {
      // Decrement dataset count
      session.datasetCount = Math.max((session.datasetCount || 1) - 1, 0);
      if (session.datasetCount === 0) {
        session.status = SessionStatus.EMPTY;
      }
      changed = true;
    }

    if (changed) {
      await repo.save(session);
      ctx.broker.logger.info(
        `Session ${session.id} status: ${previousStatus} → ${session.status}`,
      );
    }

    return {
      id: session.id,
      previousStatus,
      newStatus: session.status,
      changed,
    };
  },
});
