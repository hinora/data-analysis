/**
 * Numeric Field Utilities
 *
 * Shared helpers for tools that need to detect whether a JSONB field
 * contains numeric values and safely cast them to ::numeric in SQL.
 * Handles both standard (dot-decimal) and European/Vietnamese (comma-decimal) formats.
 */

import { Errors } from "moleculer";
import type { Repository } from "typeorm";
import type { DataRecord } from "../../db/data-record.entity";

/**
 * Matches numbers in standard or comma-decimal format:
 * - "123", "-123" (integers)
 * - "123.45", "-123.45" (dot decimal)
 * - "123,45", "-123,45" (comma decimal)
 * - "1.234,56" (European: dot thousands, comma decimal)
 * - "1,234.56" (US: comma thousands, dot decimal)
 */
const NUMERIC_REGEX = /^-?\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$|^-?\d+([.,]\d+)?$/;

type NumberFormat = "comma_decimal" | "standard";

/**
 * Detects whether a JSONB field uses comma as its decimal separator.
 * Samples values containing commas and analyzes the pattern.
 */
async function detectNumberFormat(req: {
  datasetId: string;
  field: string;
  repo: Repository<DataRecord>;
}): Promise<NumberFormat> {
  const { datasetId, field, repo } = req;

  const samples = await repo
    .createQueryBuilder("r")
    .select(`r.data->>'${field}'`, "val")
    .where("r.datasetId = :datasetId", { datasetId })
    .andWhere(`r.data->>'${field}' IS NOT NULL`)
    .andWhere(`r.data->>'${field}' LIKE '%,%'`)
    .limit(5)
    .getRawMany();

  if (samples.length === 0) return "standard";

  for (const sample of samples) {
    const val = sample.val?.trim();
    if (!val) continue;

    // Comma followed by 1 or 2 digits at end → comma is decimal separator
    // e.g., "60,00", "1.234,5", "123,45"
    if (/,\d{1,2}$/.test(val)) {
      return "comma_decimal";
    }

    // Dot-thousands + comma-decimal pattern: 1.234,567
    if (/\.\d{3},/.test(val)) {
      return "comma_decimal";
    }
  }

  return "standard";
}

/**
 * Builds a SQL expression to cast a JSONB text value to numeric,
 * handling comma-decimal format by replacing separators.
 *
 * For comma-decimal format (e.g., "1.234,56"):
 *   REPLACE(REPLACE(expr, '.', ''), ',', '.')::numeric
 *
 * For standard format (e.g., "1234.56"):
 *   (expr)::numeric
 */
function buildNumericCast(jsonExpr: string, format: NumberFormat): string {
  if (format === "comma_decimal") {
    return `REPLACE(REPLACE(${jsonExpr}, '.', ''), ',', '.')::numeric`;
  }
  return `(${jsonExpr})::numeric`;
}

/**
 * Detects the number format and returns a SQL expression for numeric casting.
 * Use this instead of manually writing `(r.data->>'field')::numeric`.
 *
 * @param tableAlias - Query builder alias (e.g., "r"). Omit for raw SQL without alias.
 *
 * @example
 * // Query builder (alias "r"):
 * const cast = await getNumericCastExpr({ datasetId, field, repo, tableAlias: "r" });
 * // → "(r.data->>'price')::numeric"  or  "REPLACE(REPLACE(r.data->>'price', '.', ''), ',', '.')::numeric"
 *
 * // Raw SQL (no alias):
 * const cast = await getNumericCastExpr({ datasetId, field, repo });
 * // → "(data->>'price')::numeric"  or  "REPLACE(REPLACE(data->>'price', '.', ''), ',', '.')::numeric"
 */
export async function getNumericCastExpr(req: {
  datasetId: string;
  field: string;
  repo: Repository<DataRecord>;
  tableAlias?: string;
}): Promise<string> {
  const { datasetId, field, repo, tableAlias } = req;
  const format = await detectNumberFormat({ datasetId, field, repo });
  const prefix = tableAlias ? `${tableAlias}.` : "";
  const jsonExpr = `${prefix}data->>'${field}'`;
  return buildNumericCast(jsonExpr, format);
}

/**
 * Samples one non-null value from a JSONB field and checks if it looks numeric.
 * Handles both dot-decimal and comma-decimal formats.
 */
export async function isFieldNumeric(req: {
  datasetId: string;
  field: string;
  repo: Repository<DataRecord>;
}): Promise<boolean> {
  const { datasetId, field, repo } = req;

  const sample = await repo
    .createQueryBuilder("r")
    .select(`r.data->>'${field}'`, "val")
    .where("r.datasetId = :datasetId", { datasetId })
    .andWhere(`r.data->>'${field}' IS NOT NULL`)
    .limit(1)
    .getRawOne();

  return sample?.val != null && NUMERIC_REGEX.test(sample.val.trim());
}

/**
 * Asserts that the field is numeric, throwing a clear MoleculerClientError if not.
 * Use this in tools where the operation inherently requires numeric data (SUM, AVG, etc.).
 */
export async function assertFieldIsNumeric(req: {
  datasetId: string;
  field: string;
  repo: Repository<DataRecord>;
  toolName: string;
}): Promise<void> {
  const { datasetId, field, repo, toolName } = req;
  const numeric = await isFieldNumeric({ datasetId, field, repo });

  if (!numeric) {
    throw new Errors.MoleculerClientError(
      `Field '${field}' contains non-numeric values. The ${toolName} tool requires a numeric field.`,
      422,
      "NON_NUMERIC_FIELD",
      { field },
    );
  }
}
