/**
 * Sum Field Tool
 *
 * Sum a numeric field in a dataset with optional groupBy.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { assertFieldIsNumeric } from "./numericFieldUtils";

export interface SumFieldParams {
  datasetId: string;
  field: string;
  groupBy?: string;
}

export default defineAction<SumFieldParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
    groupBy: { type: "string", optional: true },
  },

  async handler(ctx: TypedContext<SumFieldParams>) {
    const { datasetId, field, groupBy } = ctx.params;
    const repo = dataSource.getRepository(DataRecord);

    await assertFieldIsNumeric({
      datasetId,
      field,
      repo,
      toolName: "sumField",
    });

    const qb = repo
      .createQueryBuilder("r")
      .where("r.datasetId = :datasetId", { datasetId });

    if (groupBy) {
      qb.select([
        `r.data->>'${groupBy}' AS "group"`,
        `SUM((r.data->>'${field}')::numeric) AS "total"`,
      ]);
      qb.groupBy(`r.data->>'${groupBy}'`);
      qb.orderBy(`"total"`, "DESC");
    } else {
      qb.select(`SUM((r.data->>'${field}')::numeric) AS "total"`);
    }

    const results = await qb.getRawMany();
    return groupBy ? { results } : { total: results[0]?.total ?? 0 };
  },
});
