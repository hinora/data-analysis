/**
 * Get Percentile Tool
 *
 * Calculate percentile values for a numeric field.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { dataSource, getTableName } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import {
  assertFieldIsNumeric,
  getNumericCastExpr,
  numericWhereClause,
} from "./numericFieldUtils";

export interface GetPercentileParams {
  datasetId: string;
  field: string;
  percentiles?: number[];
}

export default defineAction<GetPercentileParams, unknown>({
  authentication: true,
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
    percentiles: {
      type: "array",
      items: { type: "number", min: 0, max: 100 },
      optional: true,
      default: [25, 50, 75, 90, 95, 99],
    },
  },

  async handler(ctx: AuthenticatedContext<GetPercentileParams>) {
    const {
      datasetId,
      field,
      percentiles = [25, 50, 75, 90, 95, 99],
    } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    await assertFieldIsNumeric({
      datasetId,
      field,
      repo,
      toolName: "getPercentile",
    });

    const numExpr = await getNumericCastExpr({ datasetId, field, repo });

    const percentileExprs = percentiles.map(
      (p) =>
        `PERCENTILE_CONT(${p / 100}) WITHIN GROUP (ORDER BY ${numExpr}) AS "p${p}"`,
    );

    const whereClause = numericWhereClause({ field });

    const result = await dataSource.query(
      `
      SELECT
        ${percentileExprs.join(",\n        ")},
        COUNT(*) AS "count"
      FROM ${getTableName(DataRecord)}
      WHERE "datasetId" = $1
        AND ${whereClause}
      `,
      [datasetId],
    );

    const row = result[0] || {};
    const percentileResults: Record<string, number | null> = {};
    for (const p of percentiles) {
      percentileResults[`p${p}`] =
        row[`p${p}`] != null ? Number(row[`p${p}`]) : null;
    }

    return {
      field,
      ...percentileResults,
      count: row.count ?? 0,
    };
  },
});
