/**
 * Sum Field Tool
 *
 * Sum a numeric field in a dataset with optional groupBy.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { assertFieldIsNumeric, getNumericCastExpr } from "./numericFieldUtils";

const MAX_GROUP_ROWS = 200;

export interface SumFieldParams {
  datasetId: string;
  field: string;
  groupBy?: string;
  limit?: number;
}

export default defineAction<SumFieldParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
    groupBy: { type: "string", optional: true },
    limit: {
      type: "number",
      optional: true,
      integer: true,
      min: 1,
      max: MAX_GROUP_ROWS,
    },
  },

  async handler(ctx: TypedContext<SumFieldParams>) {
    const { datasetId, field, groupBy, limit } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    await assertFieldIsNumeric({
      datasetId,
      field,
      repo,
      toolName: "sumField",
    });

    const numExpr = await getNumericCastExpr({
      datasetId,
      field,
      repo,
      tableAlias: "r",
    });

    const qb = repo
      .createQueryBuilder("r")
      .where("r.datasetId = :datasetId", { datasetId });

    if (groupBy) {
      qb.select([
        `r.data->>'${groupBy}' AS "group"`,
        `SUM(${numExpr}) AS "total"`,
      ]);
      qb.groupBy(`r.data->>'${groupBy}'`);
      qb.orderBy(`"total"`, "DESC");

      const effectiveLimit = Math.min(limit ?? MAX_GROUP_ROWS, MAX_GROUP_ROWS);
      const allResults = await qb.getRawMany();
      const totalGroups = allResults.length;
      const truncated = totalGroups > effectiveLimit;
      const results = truncated
        ? allResults.slice(0, effectiveLimit)
        : allResults;

      return { results, totalGroups, truncated };
    }

    qb.select(`SUM(${numExpr}) AS "total"`);
    const results = await qb.getRawMany();
    return { total: results[0]?.total ?? 0 };
  },
});
