/**
 * Count Distinct Values Tool
 *
 * Counts the number of distinct values for a field without returning the values themselves.
 * Useful for numeric fields or high-cardinality fields where you only need the count.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";

export interface CountDistinctValuesParams {
  datasetId: string;
  field: string;
}

export default defineAction<CountDistinctValuesParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
  },

  async handler(ctx: TypedContext<CountDistinctValuesParams>) {
    const { datasetId, field } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const result = await repo
      .createQueryBuilder("r")
      .select(`COUNT(DISTINCT r.data->>'${field}')`, "distinctCount")
      .addSelect(`COUNT(*)`, "totalRecords")
      .where("r.datasetId = :datasetId", { datasetId })
      .andWhere(`r.data->>'${field}' IS NOT NULL`)
      .getRawOne();

    return {
      field,
      distinctCount: Number(result?.distinctCount ?? 0),
      totalRecords: Number(result?.totalRecords ?? 0),
    };
  },
});
