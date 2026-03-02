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
}

export default defineAction<GetDistinctValuesParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
  },

  async handler(ctx: TypedContext<GetDistinctValuesParams>) {
    const { datasetId, field } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const results = await repo
      .createQueryBuilder("r")
      .select([`r.data->>'${field}' AS "value"`, `COUNT(*) AS "count"`])
      .where("r.datasetId = :datasetId", { datasetId })
      .andWhere(`r.data->>'${field}' IS NOT NULL`)
      .groupBy(`r.data->>'${field}'`)
      .orderBy(`"count"`, "DESC")
      .getRawMany();

    return {
      field,
      distinctCount: results.length,
      values: results,
    };
  },
});
