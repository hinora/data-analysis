/**
 * Count And Group Tool
 *
 * Count records grouped by one or more fields.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";

const MAX_GROUP_ROWS = 200;

export interface CountAndGroupParams {
  datasetId: string;
  fields: string[];
  limit?: number;
}

export default defineAction<CountAndGroupParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    fields: { type: "array", items: "string", min: 1 },
    limit: {
      type: "number",
      optional: true,
      integer: true,
      min: 1,
      max: MAX_GROUP_ROWS,
    },
  },

  async handler(ctx: TypedContext<CountAndGroupParams>) {
    const { datasetId, fields, limit } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const selectParts = fields.map((f) => `r.data->>'${f}' AS "${f}"`);
    selectParts.push(`COUNT(*) AS "count"`);

    const groupParts = fields.map((f) => `r.data->>'${f}'`);

    const allResults = await repo
      .createQueryBuilder("r")
      .select(selectParts)
      .where("r.datasetId = :datasetId", { datasetId })
      .groupBy(groupParts.join(", "))
      .orderBy(`"count"`, "DESC")
      .getRawMany();

    const effectiveLimit = Math.min(limit ?? MAX_GROUP_ROWS, MAX_GROUP_ROWS);
    const totalGroups = allResults.length;
    const truncated = totalGroups > effectiveLimit;
    const results = truncated
      ? allResults.slice(0, effectiveLimit)
      : allResults;

    return { results, totalGroups, truncated };
  },
});
