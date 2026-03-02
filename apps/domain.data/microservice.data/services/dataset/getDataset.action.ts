/**
 * Get Dataset Action
 *
 * Returns full dataset details including metadata.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Dataset } from "../../db/dataset.entity";

export interface GetDatasetParams {
  id: string;
}

export default defineAction<GetDatasetParams, Dataset>({
  rest: "GET /:id",

  params: {
    id: { type: "uuid" },
  },

  async handler(ctx: TypedContext<GetDatasetParams>) {
    const repo = dataSource.getRepository(Dataset);

    const dataset = await repo.findOneBy({ id: ctx.params.id });

    if (!dataset) {
      throw new Errors.MoleculerClientError(
        "Dataset not found",
        404,
        "DATASET_NOT_FOUND",
        { id: ctx.params.id },
      );
    }

    return dataset;
  },
});
