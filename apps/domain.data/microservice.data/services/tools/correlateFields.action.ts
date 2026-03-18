/**
 * Correlate Fields Tool
 *
 * Calculate Pearson correlation coefficient between two numeric fields.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { dataSource, getTableName } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import {
  assertFieldIsNumeric,
  getNumericCastExpr,
  numericWhereClause,
} from "./numericFieldUtils";

export interface CorrelateFieldsParams {
  datasetId: string;
  field1: string;
  field2: string;
}

export default defineAction<CorrelateFieldsParams, unknown>({
  authentication: true,
  params: {
    datasetId: { type: "uuid" },
    field1: { type: "string" },
    field2: { type: "string" },
  },

  async handler(ctx: AuthenticatedContext<CorrelateFieldsParams>) {
    const { datasetId, field1, field2 } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    await Promise.all([
      assertFieldIsNumeric({
        datasetId,
        field: field1,
        repo,
        toolName: "correlateFields",
      }),
      assertFieldIsNumeric({
        datasetId,
        field: field2,
        repo,
        toolName: "correlateFields",
      }),
    ]);

    const numExpr1 = await getNumericCastExpr({
      datasetId,
      field: field1,
      repo,
    });
    const numExpr2 = await getNumericCastExpr({
      datasetId,
      field: field2,
      repo,
    });

    // Use raw SQL for Pearson correlation
    const result = await dataSource.query(
      `
      SELECT
        CORR(
          ${numExpr1},
          ${numExpr2}
        ) AS correlation,
        COUNT(*) AS "sampleSize",
        AVG(${numExpr1}) AS "mean1",
        AVG(${numExpr2}) AS "mean2",
        STDDEV(${numExpr1}) AS "stddev1",
        STDDEV(${numExpr2}) AS "stddev2"
      FROM ${getTableName(DataRecord)}
      WHERE "datasetId" = $1
        AND ${numericWhereClause({ field: field1 })}
        AND ${numericWhereClause({ field: field2 })}
      `,
      [datasetId],
    );

    const row = result[0];
    const correlation =
      row?.correlation != null ? Number(row.correlation) : null;

    let strength = "none";
    if (correlation != null) {
      const abs = Math.abs(correlation);
      if (abs >= 0.8) strength = "very strong";
      else if (abs >= 0.6) strength = "strong";
      else if (abs >= 0.4) strength = "moderate";
      else if (abs >= 0.2) strength = "weak";
      else strength = "very weak";
    }

    return {
      field1,
      field2,
      correlation,
      strength,
      direction:
        correlation != null
          ? correlation > 0
            ? "positive"
            : correlation < 0
              ? "negative"
              : "none"
          : null,
      sampleSize: row?.sampleSize ?? 0,
      stats: {
        mean1: row?.mean1 ?? null,
        mean2: row?.mean2 ?? null,
        stddev1: row?.stddev1 ?? null,
        stddev2: row?.stddev2 ?? null,
      },
    };
  },
});
