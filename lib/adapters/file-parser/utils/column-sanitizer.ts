/**
 * Column Name Sanitizer
 *
 * Normalizes column names from uploaded files into safe camelCase
 * JSONB keys for storage in DataRecord.data.
 *
 * Pipeline: unicode normalize → strip special chars → camelCase → deduplicate
 */

/** SQL reserved words that need prefixing */
const RESERVED_WORDS = new Set([
  "add",
  "all",
  "alter",
  "and",
  "as",
  "asc",
  "between",
  "by",
  "case",
  "check",
  "column",
  "create",
  "database",
  "default",
  "delete",
  "desc",
  "distinct",
  "drop",
  "exists",
  "foreign",
  "from",
  "group",
  "having",
  "id",
  "in",
  "index",
  "inner",
  "insert",
  "into",
  "is",
  "join",
  "key",
  "left",
  "like",
  "limit",
  "not",
  "null",
  "on",
  "or",
  "order",
  "outer",
  "primary",
  "references",
  "right",
  "select",
  "set",
  "table",
  "then",
  "to",
  "union",
  "unique",
  "update",
  "values",
  "where",
]);

const MAX_NAME_LENGTH = 64;

/**
 * Sanitize a single column name into a safe camelCase identifier
 *
 * @param name - Original column name
 * @param existingNames - Set of already-used names (for deduplication)
 * @returns Sanitized camelCase name
 */
export function sanitizeColumnName(
  name: string,
  existingNames: Set<string>,
): string {
  // Step 1: Normalize to lowercase_with_underscores (intermediate)
  let intermediate = name
    .normalize("NFD") // decompose unicode
    .replace(/[\u0300-\u036f]/g, "") // strip diacritical marks
    .replace(/[^\w\s]/g, "") // remove non-alphanumeric
    .trim()
    .replace(/\s+/g, "_") // spaces → underscores
    .replace(/_+/g, "_") // collapse multiple underscores
    .replace(/^_|_$/g, "") // trim leading/trailing underscores
    .toLowerCase();

  // Handle names starting with digits
  if (/^\d/.test(intermediate)) {
    intermediate = `col_${intermediate}`;
  }

  // Handle empty names
  if (!intermediate) {
    intermediate = "unnamed_column";
  }

  // Truncate long names
  if (intermediate.length > MAX_NAME_LENGTH) {
    intermediate = intermediate.substring(0, MAX_NAME_LENGTH);
    // Remove trailing underscore from truncation
    intermediate = intermediate.replace(/_$/, "");
  }

  // Step 2: Convert to camelCase (final JSONB key)
  let camelCase = intermediate.replace(/_([a-z0-9])/g, (_, c: string) =>
    c.toUpperCase(),
  );

  // Step 3: Handle reserved words
  if (RESERVED_WORDS.has(camelCase.toLowerCase())) {
    camelCase = `col${camelCase.charAt(0).toUpperCase()}${camelCase.slice(1)}`;
  }

  // Step 4: Deduplicate
  let finalName = camelCase;
  let counter = 1;
  while (existingNames.has(finalName)) {
    finalName = `${camelCase}${counter++}`;
  }

  return finalName;
}

/**
 * Sanitize an array of column names, ensuring all are unique
 *
 * @param names - Array of original column names
 * @returns Array of sanitized camelCase names (same order)
 */
export function sanitizeColumnNames(names: string[]): string[] {
  const usedNames = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    const sanitized = sanitizeColumnName(name, usedNames);
    usedNames.add(sanitized);
    result.push(sanitized);
  }

  return result;
}
