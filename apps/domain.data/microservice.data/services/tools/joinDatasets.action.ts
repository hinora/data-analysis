/**
 * Join Datasets Tool
 *
 * Join two datasets on matching fields.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource, getTableName } from "../../db";
import { DataRecord } from "../../db/data-record.entity";

export interface JoinDatasetsParams {
  leftDatasetId: string;
  rightDatasetId: string;
  leftField: string;
  rightField: string;
  joinType?: string;
  limit?: number;
}

export default defineAction<JoinDatasetsParams, unknown>({
  params: {
    leftDatasetId: { type: "uuid" },
    rightDatasetId: { type: "uuid" },
    leftField: { type: "string" },
    rightField: { type: "string" },
    joinType: {
      type: "enum",
      values: ["inner", "left", "right"],
      optional: true,
      default: "inner",
    },
    limit: {
      type: "number",
      integer: true,
      min: 1,
      max: 500,
      optional: true,
      default: 100,
    },
  },

  async handler(ctx: TypedContext<JoinDatasetsParams>) {
    const {
      leftDatasetId,
      rightDatasetId,
      leftField,
      rightField,
      joinType = "inner",
      limit = 100,
    } = ctx.params;

    // Validate both datasets exist
    await Promise.all([
      ctx.call("dataset.getDataset", { id: leftDatasetId }),
      ctx.call("dataset.getDataset", { id: rightDatasetId }),
    ]);

    const joinClause =
      joinType === "left"
        ? "LEFT JOIN"
        : joinType === "right"
          ? "RIGHT JOIN"
          : "INNER JOIN";

    const results = await dataSource.query(
      `
      SELECT
        l.data AS "leftData",
        r.data AS "rightData"
      FROM ${getTableName(DataRecord)} l
      ${joinClause} ${getTableName(DataRecord)} r
        ON r."datasetId" = $2
        AND l.data->>'${leftField}' = r.data->>'${rightField}'
      WHERE l."datasetId" = $1
      LIMIT $3
      `,
      [leftDatasetId, rightDatasetId, limit],
    );

    // Merge left and right data, prefixing right fields with right_ on conflict
    const merged = results.map(
      (row: {
        leftData: Record<string, unknown>;
        rightData: Record<string, unknown>;
      }) => {
        const result: Record<string, unknown> = { ...row.leftData };
        if (row.rightData) {
          for (const [key, value] of Object.entries(row.rightData)) {
            if (key in result) {
              result[`right_${key}`] = value;
            } else {
              result[key] = value;
            }
          }
        }
        return result;
      },
    );

    return {
      joinType,
      leftField,
      rightField,
      count: merged.length,
      results: merged,
    };
  },
});
