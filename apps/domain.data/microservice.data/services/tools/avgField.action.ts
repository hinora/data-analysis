/**
 * Average Field Tool
 *
 * Average a numeric field in a dataset with optional groupBy.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { assertFieldIsNumeric } from "./numericFieldUtils";

export interface AvgFieldParams {
  datasetId: string;
  field: string;
  groupBy?: string;
}

export default defineAction<AvgFieldParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
    groupBy: { type: "string", optional: true },
  },

  async handler(ctx: TypedContext<AvgFieldParams>) {
    const { datasetId, field, groupBy } = ctx.params;
    const repo = dataSource.getRepository(DataRecord);

    await assertFieldIsNumeric({
      datasetId,
      field,
      repo,
      toolName: "avgField",
    });

    const qb = repo
      .createQueryBuilder("r")
      .where("r.datasetId = :datasetId", { datasetId });

    if (groupBy) {
      qb.select([
        `r.data->>'${groupBy}' AS "group"`,
        `AVG((r.data->>'${field}')::numeric) AS "average"`,
        `COUNT(*) AS "count"`,
      ]);
      qb.groupBy(`r.data->>'${groupBy}'`);
      qb.orderBy(`"average"`, "DESC");
    } else {
      qb.select([
        `AVG((r.data->>'${field}')::numeric) AS "average"`,
        `COUNT(*) AS "count"`,
      ]);
    }

    const results = await qb.getRawMany();
    return groupBy
      ? { results }
      : { average: results[0]?.average ?? 0, count: results[0]?.count ?? 0 };
  },
});
