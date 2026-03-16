/**
 * Aggregate Tool
 *
 * Multi-field aggregation pipeline with optional groupBy and rich condition
 * filtering. This is the single tool for all aggregation operations (sum, avg,
 * min, max, count) — dedicated single-operation tools (sumField, avgField,
 * countAndGroup, getMinMax, count) have been consolidated here.
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

const MAX_AGGREGATE_ROWS = 200;

interface AggregationDef {
  field: string;
  operation: "sum" | "avg" | "min" | "max" | "count";
}

interface AggregateCondition {
  field: string;
  operator: "contains" | "eq" | "gt" | "gte" | "in" | "lt" | "lte" | "neq";
  value: unknown;
}

export interface AggregateParams {
  aggregations: AggregationDef[];
  conditions?: AggregateCondition[];
  datasetId: string;
  filters?: Record<string, unknown>;
  groupBy?: string[];
  limit?: number;
  orderBy?: { direction: "asc" | "desc"; field: string };
}

export default defineAction<AggregateParams, unknown>({
  params: {
    aggregations: {
      type: "array",
      items: {
        type: "object",
        props: {
          field: { type: "string" },
          operation: {
            type: "enum",
            values: ["sum", "avg", "min", "max", "count"],
          },
        },
      },
    },
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
    datasetId: { type: "uuid" },
    filters: { type: "object", optional: true },
    groupBy: { type: "array", items: "string", optional: true },
    limit: {
      type: "number",
      optional: true,
      integer: true,
      min: 1,
      max: MAX_AGGREGATE_ROWS,
    },
    orderBy: {
      type: "object",
      optional: true,
      props: {
        direction: { type: "enum", values: ["asc", "desc"] },
        field: { type: "string" },
      },
    },
  },

  async handler(ctx: TypedContext<AggregateParams>) {
    const {
      aggregations,
      conditions,
      datasetId,
      filters,
      groupBy,
      limit,
      orderBy,
    } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const repo = dataSource.getRepository(DataRecord);

    const qb = repo
      .createQueryBuilder("r")
      .where("r.datasetId = :datasetId", { datasetId });

    // Apply simple equality filters (legacy — prefer conditions for new queries)
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        // Skip non-primitive values (AI sometimes passes objects with operators)
        if (value !== null && typeof value === "object") {
          continue;
        }
        qb.andWhere(`r.data->>'${key}' = :filter_${key}`, {
          [`filter_${key}`]: String(value),
        });
      }
    }

    // Apply rich conditions with operators
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

    // Exclude NULL groupBy values — they are not useful for analysis
    if (groupBy && groupBy.length > 0) {
      for (const g of groupBy) {
        qb.andWhere(`r.data->>'${g}' IS NOT NULL`);
      }
    }

    // Build aggregation selects
    const selectParts: string[] = [];
    for (const agg of aggregations) {
      const aggRepo = dataSource.getRepository(DataRecord);
      switch (agg.operation) {
        case "sum":
        case "avg": {
          await assertFieldIsNumeric({
            datasetId,
            field: agg.field,
            repo: aggRepo,
            toolName: "aggregate",
          });
          const numCol = await getNumericCastExpr({
            datasetId,
            field: agg.field,
            repo: aggRepo,
            tableAlias: "r",
          });
          selectParts.push(
            agg.operation === "sum"
              ? `SUM(${numCol}) AS "${agg.field}_sum"`
              : `AVG(${numCol}) AS "${agg.field}_avg"`,
          );
          break;
        }
        case "min":
        case "max": {
          const numeric = await isFieldNumeric({
            datasetId,
            field: agg.field,
            repo: aggRepo,
          });
          const col = numeric
            ? await getNumericCastExpr({
                datasetId,
                field: agg.field,
                repo: aggRepo,
                tableAlias: "r",
              })
            : `r.data->>'${agg.field}'`;
          selectParts.push(
            agg.operation === "min"
              ? `MIN(${col}) AS "${agg.field}_min"`
              : `MAX(${col}) AS "${agg.field}_max"`,
          );
          break;
        }
        case "count":
          selectParts.push(
            `COUNT(r.data->>'${agg.field}') AS "${agg.field}_count"`,
          );
          break;
      }
    }

    if (groupBy && groupBy.length > 0) {
      for (const g of groupBy) {
        selectParts.unshift(`r.data->>'${g}' AS "${g}"`);
        qb.addGroupBy(`r.data->>'${g}'`);
      }
    }

    qb.select(selectParts);

    // Apply ordering
    if (orderBy && groupBy?.length) {
      const dir = orderBy.direction === "asc" ? "ASC" : "DESC";
      const nulls = orderBy.direction === "asc" ? "NULLS FIRST" : "NULLS LAST";
      const isGroupByField = groupBy.includes(orderBy.field);

      // Match orderBy.field to an aggregation alias.
      // AI may send either "triGiaUsd" (base field) or "triGiaUsd_sum" (full alias).
      const aggMatch = aggregations.find(
        (a) =>
          a.field === orderBy.field ||
          `${a.field}_${a.operation}` === orderBy.field,
      );

      if (aggMatch) {
        const alias = `"${aggMatch.field}_${aggMatch.operation}"`;
        qb.orderBy(alias, dir, nulls);
      } else if (isGroupByField) {
        qb.orderBy(`r.data->>'${orderBy.field}'`, dir, nulls);
      }
    }

    // Count total groups before applying limit
    const effectiveLimit = Math.min(
      limit ?? MAX_AGGREGATE_ROWS,
      MAX_AGGREGATE_ROWS,
    );

    const allResults = await qb.getRawMany();
    const totalGroups = allResults.length;
    const truncated = totalGroups > effectiveLimit;
    const results = truncated
      ? allResults.slice(0, effectiveLimit)
      : allResults;

    return { results, totalGroups, truncated };
  },
});
