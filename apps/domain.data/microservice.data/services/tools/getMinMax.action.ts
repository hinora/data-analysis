/**
 * Get Min Max Tool
 *
 * Get min and max values for a numeric field.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { getNumericCastExpr, isFieldNumeric } from "./numericFieldUtils";

export interface GetMinMaxParams {
  datasetId: string;
  field: string;
}

export default defineAction<GetMinMaxParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
  },

  async handler(ctx: TypedContext<GetMinMaxParams>) {
    const { datasetId, field } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const numeric = await isFieldNumeric({ datasetId, field, repo });
    const castExpr = numeric
      ? await getNumericCastExpr({ datasetId, field, repo, tableAlias: "r" })
      : `r.data->>'${field}'`;

    const result = await repo
      .createQueryBuilder("r")
      .select([
        `MIN(${castExpr}) AS "min"`,
        `MAX(${castExpr}) AS "max"`,
        `COUNT(*) AS "count"`,
      ])
      .where("r.datasetId = :datasetId", { datasetId })
      .andWhere(`r.data->>'${field}' IS NOT NULL`)
      .getRawOne();

    return {
      field,
      min: result?.min ?? null,
      max: result?.max ?? null,
      count: result?.count ?? 0,
      range:
        result?.min != null && result?.max != null
          ? Number(result.max) - Number(result.min)
          : null,
    };
  },
});
