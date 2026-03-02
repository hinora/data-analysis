/**
 * Count And Group Tool
 *
 * Count records grouped by one or more fields.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";

export interface CountAndGroupParams {
  datasetId: string;
  fields: string[];
}

export default defineAction<CountAndGroupParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    fields: { type: "array", items: "string", min: 1 },
  },

  async handler(ctx: TypedContext<CountAndGroupParams>) {
    const { datasetId, fields } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const selectParts = fields.map((f) => `r.data->>'${f}' AS "${f}"`);
    selectParts.push(`COUNT(*) AS "count"`);

    const groupParts = fields.map((f) => `r.data->>'${f}'`);

    const results = await repo
      .createQueryBuilder("r")
      .select(selectParts)
      .where("r.datasetId = :datasetId", { datasetId })
      .groupBy(groupParts.join(", "))
      .orderBy(`"count"`, "DESC")
      .getRawMany();

    return { results, totalGroups: results.length };
  },
});
