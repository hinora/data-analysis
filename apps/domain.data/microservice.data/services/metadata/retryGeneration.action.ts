/**
 * Retry Generation Action
 *
 * Re-triggers metadata generation for datasets with status "failed".
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { Dataset, MetadataStatus } from "../../db/dataset.entity";

export interface RetryGenerationParams {
  datasetId: string;
}

export interface RetryGenerationResult {
  success: boolean;
  datasetId: string;
}

export default defineAction<RetryGenerationParams, RetryGenerationResult>({
  rest: "POST /:datasetId/retry",

  params: {
    datasetId: { type: "uuid" },
  },

  async handler(ctx: TypedContext<RetryGenerationParams>) {
    const repo = dataSource.getRepository(Dataset);

    const dataset = await repo.findOneBy({ id: ctx.params.datasetId });

    if (!dataset) {
      throw new Errors.MoleculerClientError(
        "Dataset not found",
        404,
        "DATASET_NOT_FOUND",
        { id: ctx.params.datasetId },
      );
    }

    if (dataset.metadataStatus !== MetadataStatus.FAILED) {
      throw new Errors.MoleculerClientError(
        "Can only retry metadata generation for datasets with 'failed' status",
        400,
        "INVALID_STATUS",
        { currentStatus: dataset.metadataStatus },
      );
    }

    // Reset status and re-emit the event
    await repo.update(dataset.id, {
      metadataStatus: MetadataStatus.PENDING,
    });

    await ctx.emit("metadata.generateMetadata", {
      datasetId: dataset.id,
      sessionId: dataset.sessionId,
      datasetType: dataset.datasetType,
      name: dataset.name,
    });

    return {
      success: true,
      datasetId: dataset.id,
    };
  },
});
