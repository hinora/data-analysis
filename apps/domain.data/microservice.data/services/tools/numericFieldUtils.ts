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
 * - "123.45", "-123.456789" (dot decimal, any precision)
 * - "123,45", "-123,45" (comma decimal)
 * - "1.234,56" (European: dot thousands, comma decimal)
 * - "1,234.56" (US: comma thousands, dot decimal)
 * - "1,234.5678" (US with high precision)
 *
 * NOTE: Values must be stripped of currency/unit symbols before testing.
 * Use `stripNonNumeric()` for JS-side stripping.
 */
const NUMERIC_REGEX = /^-?\d{1,3}([.,]\d{3})*([.,]\d+)?$|^-?\d+([.,]\d+)?$/;

/**
 * Strips common currency symbols, unit prefixes/suffixes, and whitespace
 * from a string value so the numeric regex can match the core number.
 * Handles: $, €, £, ¥, ₫, ₩, ₹, %, spaces, and other common prefixes.
 *
 * @example
 * stripNonNumeric("$188.54")   // → "188.54"
 * stripNonNumeric("€1.234,56") // → "1.234,56"
 * stripNonNumeric("50%")       // → "50"
 * stripNonNumeric("-$12.34")   // → "-12.34"
 */
function stripNonNumeric(val: string): string {
  return val.replace(/^[^\d-]*(-?)[^\d]*/, "$1").replace(/[^\d.,]+$/, "");
}

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
    const val = stripNonNumeric(sample.val?.trim() ?? "");
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
 * SQL expression that strips non-numeric characters (currency symbols, letters,
 * spaces) from a JSONB text value, keeping only digits, dots, commas, and minus.
 * This is applied before decimal-format transforms and ::numeric casting.
 */
function sqlStripNonNumeric(jsonExpr: string): string {
  return `REGEXP_REPLACE(${jsonExpr}, '[^0-9.,-]', '', 'g')`;
}

function buildNumericCast(jsonExpr: string, format: NumberFormat): string {
  const stripped = sqlStripNonNumeric(jsonExpr);
  if (format === "comma_decimal") {
    return `REPLACE(REPLACE(${stripped}, '.', ''), ',', '.')::numeric`;
  }
  return `(${stripped})::numeric`;
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

const SAMPLE_SIZE = 10;
const NUMERIC_THRESHOLD = 0.5;

/**
 * Samples multiple non-empty values from a JSONB field and checks if the
 * majority look numeric. Filters out empty/blank strings so stray empty
 * cells don't cause false negatives.
 */
export async function isFieldNumeric(req: {
  datasetId: string;
  field: string;
  repo: Repository<DataRecord>;
}): Promise<boolean> {
  const { datasetId, field, repo } = req;

  const samples = await repo
    .createQueryBuilder("r")
    .select(`r.data->>'${field}'`, "val")
    .where("r.datasetId = :datasetId", { datasetId })
    .andWhere(`r.data->>'${field}' IS NOT NULL`)
    .andWhere(`TRIM(r.data->>'${field}') != ''`)
    .limit(SAMPLE_SIZE)
    .getRawMany();

  if (samples.length === 0) return false;

  const numericCount = samples.filter((s) =>
    NUMERIC_REGEX.test(stripNonNumeric(s.val.trim())),
  ).length;

  return numericCount / samples.length >= NUMERIC_THRESHOLD;
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

/**
 * Returns a SQL WHERE clause fragment that filters out NULL and empty/blank
 * values for a JSONB field. Use this in raw SQL queries before numeric casting
 * to prevent `::numeric` cast errors on stray non-numeric rows.
 *
 * @param tableAlias - Optional table alias (e.g., "r"). Omit for raw SQL.
 *
 * @example
 * const filter = numericWhereClause({ field: "price", tableAlias: "r" });
 * // → "r.data->>'price' IS NOT NULL AND TRIM(r.data->>'price') != ''"
 */
export function numericWhereClause(req: {
  field: string;
  tableAlias?: string;
}): string {
  const { field, tableAlias } = req;
  const prefix = tableAlias ? `${tableAlias}.` : "";
  const jsonExpr = `${prefix}data->>'${field}'`;
  return `${jsonExpr} IS NOT NULL AND TRIM(${jsonExpr}) != ''`;
}
