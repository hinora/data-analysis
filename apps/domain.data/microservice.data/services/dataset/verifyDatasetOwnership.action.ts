/**
 * Verify Dataset Ownership Action
 *
 * Internal action that checks whether a dataset belongs to a given user
 * (via session ownership). Throws 404 if the dataset does not exist or
 * its session does not belong to the user.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Dataset } from "../../db/dataset.entity";

export interface VerifyDatasetOwnershipParams {
  datasetId: string;
  userId: string;
}

export interface VerifyDatasetOwnershipResult {
  datasetId: string;
  sessionId: string;
  userId: string;
}

export default defineAction<
  VerifyDatasetOwnershipParams,
  VerifyDatasetOwnershipResult
>({
  params: {
    datasetId: { type: "uuid" },
    userId: { type: "uuid" },
  },

  async handler(ctx: TypedContext<VerifyDatasetOwnershipParams>) {
    const { datasetId, userId } = ctx.params;
    const repo = dataSource.getRepository(Dataset);

    const dataset = await repo.findOneBy({ id: datasetId });
    if (!dataset) {
      throw new Errors.MoleculerClientError(
        "Dataset not found",
        404,
        "DATASET_NOT_FOUND",
        { id: datasetId },
      );
    }

    // Verify session ownership via cross-service call
    await ctx.call("session.verifySessionOwnership", {
      sessionId: dataset.sessionId,
      userId,
    });

    return {
      datasetId,
      sessionId: dataset.sessionId,
      userId,
    };
  },
});
