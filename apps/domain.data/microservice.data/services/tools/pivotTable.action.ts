/**
 * Pivot Table Tool
 *
 * Create a pivot table (cross-tabulation) from a dataset.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { assertFieldIsNumeric, getNumericCastExpr } from "./numericFieldUtils";

export interface PivotTableParams {
  datasetId: string;
  rowField: string;
  columnField: string;
  valueField: string;
  aggregation?: string;
}

export default defineAction<PivotTableParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    rowField: { type: "string" },
    columnField: { type: "string" },
    valueField: { type: "string" },
    aggregation: {
      type: "enum",
      values: ["sum", "avg", "count", "min", "max"],
      optional: true,
      default: "sum",
    },
  },

  async handler(ctx: TypedContext<PivotTableParams>) {
    const {
      datasetId,
      rowField,
      columnField,
      valueField,
      aggregation = "sum",
    } = ctx.params;

    await ctx.call("dataset.getDataset", { id: datasetId });

    // First get distinct column values
    const repo = dataSource.getRepository(DataRecord);

    if (aggregation !== "count") {
      await assertFieldIsNumeric({
        datasetId,
        field: valueField,
        repo,
        toolName: "pivotTable",
      });
    }

    const columnValues = await repo
      .createQueryBuilder("r")
      .select(`DISTINCT r.data->>'${columnField}' AS "colVal"`)
      .where("r.datasetId = :datasetId", { datasetId })
      .andWhere(`r.data->>'${columnField}' IS NOT NULL`)
      .orderBy(`"colVal"`, "ASC")
      .getRawMany();

    const cols = columnValues.map((cv) => cv.colVal);

    const numExpr = await getNumericCastExpr({
      datasetId,
      field: valueField,
      repo,
      tableAlias: "r",
    });

    // Build pivot query with CASE expressions
    const caseParts = cols.map((col, i) => {
      const aggFn = aggregation.toUpperCase();
      return `${aggFn}(CASE WHEN r.data->>'${columnField}' = '${col.replace(/'/g, "''")}' THEN ${numExpr} END) AS "col_${i}"`;
    });

    const qb = repo
      .createQueryBuilder("r")
      .select([`r.data->>'${rowField}' AS "row"`, ...caseParts])
      .where("r.datasetId = :datasetId", { datasetId })
      .groupBy(`r.data->>'${rowField}'`)
      .orderBy(`r.data->>'${rowField}'`, "ASC");

    const rawResults = await qb.getRawMany();

    // Remap column names
    const results = rawResults.map((row) => {
      const mapped: Record<string, unknown> = { [rowField]: row.row };
      for (let i = 0; i < cols.length; i++) {
        mapped[cols[i]] = row[`col_${i}`];
      }
      return mapped;
    });

    return {
      rowField,
      columnField,
      valueField,
      aggregation,
      columns: cols,
      results,
    };
  },
});
