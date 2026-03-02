/**
 * Count Tool
 *
 * Count records in a dataset with optional filter conditions.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";

export interface CountParams {
  datasetId: string;
  filters?: Record<string, unknown>;
}

export default defineAction<CountParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    filters: { type: "object", optional: true },
  },

  async handler(ctx: TypedContext<CountParams>) {
    const { datasetId, filters } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const qb = repo
      .createQueryBuilder("r")
      .where("r.datasetId = :datasetId", { datasetId });

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        qb.andWhere(`r.data->>'${key}' = :filter_${key}`, {
          [`filter_${key}`]: String(value),
        });
      }
    }

    const count = await qb.getCount();
    return { count };
  },
});
