/**
 * Rename Dataset Action
 *
 * Rename a dataset with validation.
 */

import type { AuthenticatedContext } from "core.lib/broker";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Dataset } from "../../db/dataset.entity";

export interface RenameDatasetParams {
  id: string;
  name: string;
}

export default defineAction<RenameDatasetParams, unknown>({
  authentication: true,
  rest: "PATCH /:id/rename",

  params: {
    id: { type: "uuid" },
    name: { type: "string", min: 1, max: 200 },
  },

  async handler(ctx: AuthenticatedContext<RenameDatasetParams>) {
    const { id, name } = ctx.params;
    const repo = dataSource.getRepository(Dataset);

    const dataset = await repo.findOneBy({ id });
    if (!dataset) {
      throw new Errors.MoleculerClientError(
        "Dataset not found",
        404,
        "DATASET_NOT_FOUND",
        { id },
      );
    }

    // Verify session ownership
    await ctx.call("session.getSession", { id: dataset.sessionId });

    dataset.name = name.trim();
    const saved = await repo.save(dataset);

    return saved;
  },
});
