/**
 * Get Distinct Values Tool
 *
 * Get distinct values with counts for a field.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";

export interface GetDistinctValuesParams {
  datasetId: string;
  field: string;
  limit?: number;
}

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 2000;

export default defineAction<GetDistinctValuesParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
    limit: {
      type: "number",
      integer: true,
      min: 1,
      max: MAX_LIMIT,
      optional: true,
    },
  },

  async handler(ctx: TypedContext<GetDistinctValuesParams>) {
    const { datasetId, field } = ctx.params;
    const limit = Math.min(ctx.params.limit || DEFAULT_LIMIT, MAX_LIMIT);
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const [results, totalResult] = await Promise.all([
      repo
        .createQueryBuilder("r")
        .select([`r.data->>'${field}' AS "value"`, `COUNT(*) AS "count"`])
        .where("r.datasetId = :datasetId", { datasetId })
        .andWhere(`r.data->>'${field}' IS NOT NULL`)
        .groupBy(`r.data->>'${field}'`)
        .orderBy(`"count"`, "DESC")
        .limit(limit)
        .getRawMany(),
      repo
        .createQueryBuilder("r")
        .select(`COUNT(DISTINCT r.data->>'${field}')`, "total")
        .where("r.datasetId = :datasetId", { datasetId })
        .andWhere(`r.data->>'${field}' IS NOT NULL`)
        .getRawOne(),
    ]);

    const totalInDataset = Number(totalResult?.total ?? 0);

    return {
      field,
      distinctCount: results.length,
      limit,
      totalInDataset,
      values: results,
    };
  },
});
