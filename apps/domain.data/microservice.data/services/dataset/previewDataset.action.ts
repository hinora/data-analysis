/**
 * Preview Dataset Action
 *
 * Return first N rows with original and camelCase column headers and detected types.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { Dataset } from "../../db/dataset.entity";

export interface PreviewDatasetParams {
  id: string;
  limit?: number;
}

export default defineAction<PreviewDatasetParams, unknown>({
  authentication: true,
  rest: "GET /:id/preview",

  params: {
    id: { type: "uuid" },
    limit: {
      type: "number",
      convert: true,
      integer: true,
      min: 1,
      max: 100,
      optional: true,
      default: 50,
    },
  },

  async handler(ctx: AuthenticatedContext<PreviewDatasetParams>) {
    const { id, limit = 50 } = ctx.params;
    const datasetRepo = dataSource.getRepository(Dataset);
    const recordRepo = dataSource.getRepository(DataRecord);

    const dataset = await datasetRepo.findOneBy({ id });
    if (!dataset) {
      throw new Errors.MoleculerClientError(
        "Dataset not found",
        404,
        "DATASET_NOT_FOUND",
        { id },
      );
    }

    // Verify session belongs to the authenticated user
    await ctx.call("session.getSession", { id: dataset.sessionId });

    const records = await recordRepo.find({
      where: { datasetId: id },
      take: limit,
    });

    const rows = records.map((r) => r.data);

    // Build column info from columnMappings
    const columns = (dataset.columnMappings || []).map((col) => ({
      original: col.original,
      camelCase: col.camelCase,
      detectedType: col.detectedType,
    }));

    return {
      dataset: {
        id: dataset.id,
        name: dataset.name,
        fileType: dataset.fileType,
        datasetType: dataset.datasetType,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
      },
      columns,
      rows,
      previewCount: rows.length,
    };
  },
});
