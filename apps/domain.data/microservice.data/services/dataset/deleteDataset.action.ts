/**
 * Delete Dataset Action
 *
 * Delete a dataset with cascade deletion of DataRecords, TextChunks, AILogs, and OriginalFile.
 * Updates session datasetCount.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { AILog } from "core.lib/database";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { Dataset } from "../../db/dataset.entity";
import { OriginalFile } from "../../db/original-file.entity";
import { TextChunk } from "../../db/text-chunk.entity";

export interface DeleteDatasetParams {
  id: string;
}

export default defineAction<DeleteDatasetParams, unknown>({
  authentication: true,
  rest: "DELETE /:id",

  params: {
    id: { type: "uuid" },
  },

  async handler(ctx: AuthenticatedContext<DeleteDatasetParams>) {
    const { id } = ctx.params;
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

    // Cascade delete related records
    await dataSource.getRepository(DataRecord).delete({ datasetId: id });
    await dataSource.getRepository(TextChunk).delete({ datasetId: id });
    await dataSource.getRepository(AILog).delete({ datasetId: id });

    // Delete OriginalFile if no other datasets reference it
    if (dataset.originalFileId) {
      const otherDatasets = await repo.count({
        where: { originalFileId: dataset.originalFileId },
      });
      if (otherDatasets <= 1) {
        await dataSource
          .getRepository(OriginalFile)
          .delete({ id: dataset.originalFileId });
      }
    }

    await repo.remove(dataset);

    // Update session status
    try {
      await ctx.call("session.updateSessionStatus", {
        sessionId: dataset.sessionId,
        trigger: "dataset-deleted",
      });
    } catch {
      // Non-critical
    }

    return { success: true, id };
  },
});
