/**
 * Get Top By Field Tool
 *
 * Get top N records sorted by a field.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { getNumericCastExpr, isFieldNumeric } from "./numericFieldUtils";

export interface GetTopByFieldParams {
  datasetId: string;
  field: string;
  limit?: number;
  order?: string;
}

export default defineAction<GetTopByFieldParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
    limit: {
      type: "number",
      integer: true,
      min: 1,
      max: 100,
      optional: true,
      default: 10,
    },
    order: {
      type: "enum",
      values: ["ASC", "DESC"],
      optional: true,
      default: "DESC",
    },
  },

  async handler(ctx: TypedContext<GetTopByFieldParams>) {
    const { datasetId, field, limit = 10, order = "DESC" } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const numeric = await isFieldNumeric({ datasetId, field, repo });
    const orderExpr = numeric
      ? await getNumericCastExpr({ datasetId, field, repo, tableAlias: "r" })
      : `r.data->>'${field}'`;

    const results = await repo
      .createQueryBuilder("r")
      .select("r.data")
      .where("r.datasetId = :datasetId", { datasetId })
      .andWhere(`r.data->>'${field}' IS NOT NULL`)
      .orderBy(orderExpr, order as "ASC" | "DESC")
      .limit(limit)
      .getRawMany();

    return {
      results: results.map((r) => r.r_data || r.data),
      count: results.length,
    };
  },
});
