/**
 * Aggregate Tool
 *
 * Multi-field aggregation pipeline with optional groupBy.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { assertFieldIsNumeric, isFieldNumeric } from "./numericFieldUtils";

interface AggregationDef {
  field: string;
  operation: "sum" | "avg" | "min" | "max" | "count";
}

export interface AggregateParams {
  datasetId: string;
  aggregations: AggregationDef[];
  groupBy?: string[];
  filters?: Record<string, unknown>;
}

export default defineAction<AggregateParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
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
    groupBy: { type: "array", items: "string", optional: true },
    filters: { type: "object", optional: true },
  },

  async handler(ctx: TypedContext<AggregateParams>) {
    const { datasetId, aggregations, groupBy, filters } = ctx.params;
    const repo = dataSource.getRepository(DataRecord);

    const qb = repo
      .createQueryBuilder("r")
      .where("r.datasetId = :datasetId", { datasetId });

    // Apply filters
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        qb.andWhere(`r.data->>'${key}' = :filter_${key}`, {
          [`filter_${key}`]: String(value),
        });
      }
    }

    // Build aggregation selects
    const selectParts: string[] = [];
    for (const agg of aggregations) {
      const repo = dataSource.getRepository(DataRecord);
      switch (agg.operation) {
        case "sum":
        case "avg": {
          await assertFieldIsNumeric({
            datasetId,
            field: agg.field,
            repo,
            toolName: "aggregate",
          });
          const numCol = `(r.data->>'${agg.field}')::numeric`;
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
            repo,
          });
          const col = numeric
            ? `(r.data->>'${agg.field}')::numeric`
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

    const results = await qb.getRawMany();
    return { results };
  },
});
