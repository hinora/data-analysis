/**
 * Type Inferrer
 *
 * Detects column data types (string, number, date, boolean) from sample values.
 * Used during file parsing to populate ColumnMapping.detectedType.
 */

/** Supported data types for column inference */
export type InferredType = "boolean" | "date" | "number" | "string";

/** Common date patterns for detection */
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/, // 2025-01-15
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, // 2025-01-15T10:30:00
  /^\d{2}\/\d{2}\/\d{4}$/, // 01/15/2025
  /^\d{2}-\d{2}-\d{4}$/, // 01-15-2025
  /^\w{3}\s\d{1,2},?\s\d{4}$/, // Jan 15, 2025
  /^\d{1,2}\s\w{3}\s\d{4}$/, // 15 Jan 2025
];

/** Boolean string representations */
const BOOLEAN_TRUE = new Set(["true", "yes", "1", "t", "y"]);
const BOOLEAN_FALSE = new Set(["false", "no", "0", "f", "n"]);

/**
 * Check if a string looks like a date
 */
function isDateLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Check against known patterns
  for (const pattern of DATE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  // Try parsing as a date — only accept if the result is a valid date
  // and the string isn't just a number
  if (!/^\d+$/.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      // Verify it's a reasonable date (between 1900 and 2100)
      const year = new Date(parsed).getFullYear();
      if (year >= 1900 && year <= 2100) return true;
    }
  }

  return false;
}

/**
 * Check if a string looks like a number
 */
function isNumberLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Remove currency symbols and commas for number detection
  const cleaned = trimmed.replace(/[$€£¥,]/g, "").trim();
  if (!cleaned) return false;

  // Check if it's a valid number
  const num = Number(cleaned);
  return !Number.isNaN(num) && Number.isFinite(num);
}

/**
 * Check if a string looks like a boolean
 */
function isBooleanLike(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return BOOLEAN_TRUE.has(lower) || BOOLEAN_FALSE.has(lower);
}

/**
 * Infer the data type of a column from sample values
 *
 * @param values - Sample values from the column (non-null, non-empty)
 * @returns The inferred data type
 */
export function inferColumnType(values: unknown[]): InferredType {
  // Filter to non-null, non-empty string representations
  const samples = values
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => String(v))
    .slice(0, 100); // Use at most 100 samples

  if (samples.length === 0) return "string";

  // Count type matches
  let booleanCount = 0;
  let dateCount = 0;
  let numberCount = 0;

  for (const sample of samples) {
    if (isBooleanLike(sample)) booleanCount++;
    if (isNumberLike(sample)) numberCount++;
    if (isDateLike(sample)) dateCount++;
  }

  const threshold = samples.length * 0.8; // 80% of samples must match

  // Priority: boolean > date > number > string
  if (booleanCount >= threshold) return "boolean";
  if (dateCount >= threshold) return "date";
  if (numberCount >= threshold) return "number";

  return "string";
}
