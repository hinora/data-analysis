/**
 * Detect Outliers Tool
 *
 * Detect outliers using IQR method for a numeric field.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { assertFieldIsNumeric, getNumericCastExpr } from "./numericFieldUtils";

export interface DetectOutliersParams {
  datasetId: string;
  field: string;
  method?: string;
  threshold?: number;
}

export default defineAction<DetectOutliersParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
    method: {
      type: "enum",
      values: ["iqr", "zscore"],
      optional: true,
      default: "iqr",
    },
    threshold: { type: "number", optional: true, default: 1.5 },
  },

  async handler(ctx: TypedContext<DetectOutliersParams>) {
    const { datasetId, field, method = "iqr", threshold = 1.5 } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    await assertFieldIsNumeric({
      datasetId,
      field,
      repo,
      toolName: "detectOutliers",
    });

    const numExpr = await getNumericCastExpr({ datasetId, field, repo });

    if (method === "zscore") {
      // Z-score method
      const stats = await dataSource.query(
        `
        SELECT
          AVG(${numExpr}) AS mean,
          STDDEV(${numExpr}) AS stddev
        FROM data_record
        WHERE "datasetId" = $1 AND data->>'${field}' IS NOT NULL
        `,
        [datasetId],
      );

      const { mean, stddev } = stats[0] || {};
      if (!mean || !stddev || Number(stddev) === 0) {
        return {
          outliers: [],
          count: 0,
          method,
          message: "Insufficient data variance",
        };
      }

      const outliers = await dataSource.query(
        `
        SELECT data
        FROM data_record
        WHERE "datasetId" = $1
          AND data->>'${field}' IS NOT NULL
          AND ABS((${numExpr} - $2) / $3) > $4
        ORDER BY ABS((${numExpr} - $2) / $3) DESC
        LIMIT 50
        `,
        [datasetId, mean, stddev, threshold],
      );

      return {
        method: "zscore",
        field,
        threshold,
        mean: Number(mean),
        stddev: Number(stddev),
        outlierCount: outliers.length,
        outliers: outliers.map((r: { data: unknown }) => r.data),
      };
    }

    // IQR method (default)
    const quartiles = await dataSource.query(
      `
      SELECT
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${numExpr}) AS q1,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${numExpr}) AS q3
      FROM data_record
      WHERE "datasetId" = $1 AND data->>'${field}' IS NOT NULL
      `,
      [datasetId],
    );

    const { q1, q3 } = quartiles[0] || {};
    if (q1 == null || q3 == null) {
      return { outliers: [], count: 0, method, message: "Insufficient data" };
    }

    const iqr = Number(q3) - Number(q1);
    const lowerBound = Number(q1) - threshold * iqr;
    const upperBound = Number(q3) + threshold * iqr;

    const outliers = await dataSource.query(
      `
      SELECT data
      FROM data_record
      WHERE "datasetId" = $1
        AND data->>'${field}' IS NOT NULL
        AND (${numExpr} < $2 OR ${numExpr} > $3)
      ORDER BY ABS(${numExpr} - ($4 + $5) / 2) DESC
      LIMIT 50
      `,
      [datasetId, lowerBound, upperBound, q1, q3],
    );

    return {
      method: "iqr",
      field,
      threshold,
      q1: Number(q1),
      q3: Number(q3),
      iqr,
      lowerBound,
      upperBound,
      outlierCount: outliers.length,
      outliers: outliers.map((r: { data: unknown }) => r.data),
    };
  },
});
