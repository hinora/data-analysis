/**
 * Sort By Field Tool
 *
 * Sort and return records by a specified field.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import {
  getNumericCastExpr,
  isFieldNumeric,
  numericWhereClause,
} from "./numericFieldUtils";

export interface SortByFieldParams {
  datasetId: string;
  field: string;
  order?: string;
  limit?: number;
  numeric?: boolean;
}

export default defineAction<SortByFieldParams, unknown>({
  authentication: true,
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
    order: {
      type: "enum",
      values: ["ASC", "DESC"],
      optional: true,
      default: "ASC",
    },
    limit: {
      type: "number",
      integer: true,
      min: 1,
      max: 500,
      optional: true,
      default: 100,
    },
    numeric: { type: "boolean", optional: true },
  },

  async handler(ctx: AuthenticatedContext<SortByFieldParams>) {
    const {
      datasetId,
      field,
      order = "ASC",
      limit = 100,
      numeric,
    } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    // Auto-detect if not explicitly specified
    const isNumeric =
      numeric ?? (await isFieldNumeric({ datasetId, field, repo }));
    const orderExpr = isNumeric
      ? await getNumericCastExpr({ datasetId, field, repo, tableAlias: "r" })
      : `r.data->>'${field}'`;

    const results = await repo
      .createQueryBuilder("r")
      .select("r.data")
      .where("r.datasetId = :datasetId", { datasetId })
      .andWhere(
        isNumeric
          ? numericWhereClause({ field, tableAlias: "r" })
          : `r.data->>'${field}' IS NOT NULL`,
      )
      .orderBy(orderExpr, order as "ASC" | "DESC")
      .limit(limit)
      .getRawMany();

    return {
      field,
      order,
      count: results.length,
      results: results.map((r) => r.r_data || r.data),
    };
  },
});
