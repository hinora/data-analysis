/**
 * Correlate Fields Tool
 *
 * Calculate Pearson correlation coefficient between two numeric fields.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { assertFieldIsNumeric } from "./numericFieldUtils";

export interface CorrelateFieldsParams {
  datasetId: string;
  field1: string;
  field2: string;
}

export default defineAction<CorrelateFieldsParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field1: { type: "string" },
    field2: { type: "string" },
  },

  async handler(ctx: TypedContext<CorrelateFieldsParams>) {
    const { datasetId, field1, field2 } = ctx.params;
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

    // Use raw SQL for Pearson correlation
    const result = await dataSource.query(
      `
      SELECT
        CORR(
          (data->>'${field1}')::numeric,
          (data->>'${field2}')::numeric
        ) AS correlation,
        COUNT(*) AS "sampleSize",
        AVG((data->>'${field1}')::numeric) AS "mean1",
        AVG((data->>'${field2}')::numeric) AS "mean2",
        STDDEV((data->>'${field1}')::numeric) AS "stddev1",
        STDDEV((data->>'${field2}')::numeric) AS "stddev2"
      FROM data_record
      WHERE "datasetId" = $1
        AND data->>'${field1}' IS NOT NULL
        AND data->>'${field2}' IS NOT NULL
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
