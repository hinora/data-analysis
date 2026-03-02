/**
 * Filter By Condition Tool
 *
 * Filter records by conditions (equals, range, contains, in).
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { isFieldNumeric } from "./numericFieldUtils";

interface Condition {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  value: unknown;
}

export interface FilterByConditionParams {
  datasetId: string;
  conditions: Condition[];
  limit?: number;
}

export default defineAction<FilterByConditionParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    conditions: {
      type: "array",
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
    limit: {
      type: "number",
      integer: true,
      min: 1,
      max: 1000,
      optional: true,
      default: 100,
    },
  },

  async handler(ctx: TypedContext<FilterByConditionParams>) {
    const { datasetId, conditions, limit = 100 } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const qb = repo
      .createQueryBuilder("r")
      .select("r.data")
      .where("r.datasetId = :datasetId", { datasetId });

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
          const castField = numeric ? `(${jsonField})::numeric` : jsonField;
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

    const results = await qb.limit(limit).getRawMany();

    return {
      results: results.map((r) => r.r_data || r.data),
      count: results.length,
      limit,
    };
  },
});
