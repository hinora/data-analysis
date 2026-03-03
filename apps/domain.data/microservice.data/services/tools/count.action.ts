/**
 * Count Tool
 *
 * Count records in a dataset with optional filter conditions.
 * Supports both simple key-value equality filters and rich conditions
 * with operators (eq, neq, gt, gte, lt, lte, contains, in).
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { getNumericCastExpr, isFieldNumeric } from "./numericFieldUtils";

interface CountCondition {
  field: string;
  operator: "contains" | "eq" | "gt" | "gte" | "in" | "lt" | "lte" | "neq";
  value: unknown;
}

export interface CountParams {
  conditions?: CountCondition[];
  datasetId: string;
  filters?: Record<string, unknown>;
}

export default defineAction<CountParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
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
    filters: { type: "object", optional: true },
  },

  async handler(ctx: TypedContext<CountParams>) {
    const { conditions, datasetId, filters } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const qb = repo
      .createQueryBuilder("r")
      .where("r.datasetId = :datasetId", { datasetId });

    // Simple equality filters (legacy)
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        qb.andWhere(`r.data->>'${key}' = :filter_${key}`, {
          [`filter_${key}`]: String(value),
        });
      }
    }

    // Rich conditions with operators
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

    const count = await qb.getCount();
    return { count };
  },
});
