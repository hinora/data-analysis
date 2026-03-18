/**
 * List Datasets Action
 *
 * Returns datasets for a given session with summary fields.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { Dataset } from "../../db/dataset.entity";

export interface ListDatasetsParams {
  sessionId: string;
}

export default defineAction<ListDatasetsParams, Dataset[]>({
  authentication: true,
  rest: "GET /",

  params: {
    sessionId: { type: "uuid" },
  },

  async handler(ctx: AuthenticatedContext<ListDatasetsParams>) {
    const repo = dataSource.getRepository(Dataset);

    const datasets = await repo.find({
      where: { sessionId: ctx.params.sessionId },
      order: { createdAt: "DESC" },
      select: [
        "id",
        "sessionId",
        "name",
        "fileType",
        "datasetType",
        "metadataStatus",
        "rowCount",
        "columnCount",
        "columnMappings",
        "sheetName",
        "importedAt",
        "createdAt",
        "structuredMetadata",
        "unstructuredMetadata",
      ],
    });

    return datasets;
  },
});
