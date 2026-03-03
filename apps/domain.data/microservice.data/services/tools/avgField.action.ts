/**
 * Average Field Tool
 *
 * Average a numeric field in a dataset with optional groupBy and filter conditions.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import {
  assertFieldIsNumeric,
  getNumericCastExpr,
  isFieldNumeric,
} from "./numericFieldUtils";

const MAX_GROUP_ROWS = 200;

interface AvgFieldCondition {
  field: string;
  operator: "contains" | "eq" | "gt" | "gte" | "in" | "lt" | "lte" | "neq";
  value: unknown;
}

export interface AvgFieldParams {
  conditions?: AvgFieldCondition[];
  datasetId: string;
  field: string;
  groupBy?: string;
  limit?: number;
}

export default defineAction<AvgFieldParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    field: { type: "string" },
    conditions: {
      type: "array",
      optional: true,
      items: {
        type: "object",
        props: {
          field: { type: "string" },
          operator: {
            type: "enum",
            values: ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"],
          },
          value: { type: "any" },
        },
      },
    },
    groupBy: { type: "string", optional: true },
    limit: {
      type: "number",
      optional: true,
      integer: true,
      min: 1,
      max: MAX_GROUP_ROWS,
    },
  },

  async handler(ctx: TypedContext<AvgFieldParams>) {
    const { conditions, datasetId, field, groupBy, limit } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    await assertFieldIsNumeric({
      datasetId,
      field,
      repo,
      toolName: "avgField",
    });

    const numExpr = await getNumericCastExpr({
      datasetId,
      field,
      repo,
      tableAlias: "r",
    });

    const qb = repo
      .createQueryBuilder("r")
      .where("r.datasetId = :datasetId", { datasetId });

    // Apply filter conditions
    if (conditions) {
      for (let i = 0; i < conditions.length; i++) {
        const c = conditions[i];
        const paramName = `cond_${i}`;
        const jsonField = `r.data->>'${c.field}'`;

        switch (c.operator) {
          case "eq":
            qb.andWhere(`${jsonField} = :${paramName}`, {
              [paramName]: String(c.value),
            });
            break;
          case "neq":
            qb.andWhere(`${jsonField} != :${paramName}`, {
              [paramName]: String(c.value),
            });
            break;
          case "gt":
          case "gte":
          case "lt":
          case "lte": {
            const numeric = await isFieldNumeric({
              datasetId,
              field: c.field,
              repo,
            });
            const castField = numeric
              ? await getNumericCastExpr({
                  datasetId,
                  field: c.field,
                  repo,
                  tableAlias: "r",
                })
              : jsonField;
            const paramVal = numeric ? Number(c.value) : String(c.value);
            const ops = { gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
            qb.andWhere(`${castField} ${ops[c.operator]} :${paramName}`, {
              [paramName]: paramVal,
            });
            break;
          }
          case "contains":
            qb.andWhere(`${jsonField} ILIKE :${paramName}`, {
              [paramName]: `%${c.value}%`,
            });
            break;
          case "in":
            if (Array.isArray(c.value)) {
              qb.andWhere(`${jsonField} IN (:...${paramName})`, {
                [paramName]: c.value.map(String),
              });
            }
            break;
        }
      }
    }

    if (groupBy) {
      qb.select([
        `r.data->>'${groupBy}' AS "group"`,
        `AVG(${numExpr}) AS "average"`,
        `COUNT(*) AS "count"`,
      ]);
      qb.groupBy(`r.data->>'${groupBy}'`);
      qb.orderBy(`"average"`, "DESC");

      const effectiveLimit = Math.min(limit ?? MAX_GROUP_ROWS, MAX_GROUP_ROWS);
      const allResults = await qb.getRawMany();
      const totalGroups = allResults.length;
      const truncated = totalGroups > effectiveLimit;
      const results = truncated
        ? allResults.slice(0, effectiveLimit)
        : allResults;

      return { results, totalGroups, truncated };
    }

    qb.select([`AVG(${numExpr}) AS "average"`, `COUNT(*) AS "count"`]);
    const results = await qb.getRawMany();
    return { average: results[0]?.average ?? 0, count: results[0]?.count ?? 0 };
  },
});
