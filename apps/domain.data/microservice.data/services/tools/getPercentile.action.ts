/**
 * Get Percentile Tool
 *
 * Calculate percentile values for a numeric field.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { assertFieldIsNumeric } from "./numericFieldUtils";

export interface GetPercentileParams {
  datasetId: string;
  field: string;
  percentiles?: number[];
}

export default defineAction<GetPercentileParams, unknown>({
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

  async handler(ctx: TypedContext<GetPercentileParams>) {
    const {
      datasetId,
      field,
      percentiles = [25, 50, 75, 90, 95, 99],
    } = ctx.params;
    const repo = dataSource.getRepository(DataRecord);

    await assertFieldIsNumeric({
      datasetId,
      field,
      repo,
      toolName: "getPercentile",
    });

    const percentileExprs = percentiles.map(
      (p) =>
        `PERCENTILE_CONT(${p / 100}) WITHIN GROUP (ORDER BY (data->>'${field}')::numeric) AS "p${p}"`,
    );

    const result = await dataSource.query(
      `
      SELECT
        ${percentileExprs.join(",\n        ")},
        COUNT(*) AS "count"
      FROM data_record
      WHERE "datasetId" = $1
        AND data->>'${field}' IS NOT NULL
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
