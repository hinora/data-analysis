/**
 * Tests for column-sanitizer.ts
 */

import { sanitizeColumnName, sanitizeColumnNames } from "../column-sanitizer";

describe("sanitizeColumnName", () => {
  it("should convert simple names to camelCase", () => {
    const existing = new Set<string>();
    expect(sanitizeColumnName("first name", existing)).toBe("firstName");
    expect(sanitizeColumnName("last_name", existing)).toBe("lastName");
    expect(sanitizeColumnName("TOTAL REVENUE", existing)).toBe("totalRevenue");
  });

  it("should handle unicode and diacritical marks", () => {
    const existing = new Set<string>();
    expect(sanitizeColumnName("café", existing)).toBe("cafe");
    expect(sanitizeColumnName("naïve résumé", existing)).toBe("naiveResume");
  });

  it("should strip special characters", () => {
    const existing = new Set<string>();
    expect(sanitizeColumnName("price ($)", existing)).toBe("price");
    expect(sanitizeColumnName("rate %", existing)).toBe("rate");
    expect(sanitizeColumnName("col@#name", existing)).toBe("colname");
  });

  it("should prefix names starting with digits", () => {
    const existing = new Set<string>();
    expect(sanitizeColumnName("2024 Revenue", existing)).toBe("col2024Revenue");
    expect(sanitizeColumnName("1st Place", existing)).toBe("col1stPlace");
  });

  it("should handle empty names", () => {
    const existing = new Set<string>();
    expect(sanitizeColumnName("", existing)).toBe("unnamedColumn");
    expect(sanitizeColumnName("   ", existing)).toBe("unnamedColumn");
    expect(sanitizeColumnName("@#$", existing)).toBe("unnamedColumn");
  });

  it("should handle reserved SQL words", () => {
    const existing = new Set<string>();
    expect(sanitizeColumnName("select", existing)).toBe("colSelect");
    expect(sanitizeColumnName("from", existing)).toBe("colFrom");
    expect(sanitizeColumnName("id", existing)).toBe("colId");
    expect(sanitizeColumnName("order", existing)).toBe("colOrder");
  });

  it("should deduplicate names", () => {
    const existing = new Set<string>(["name"]);
    expect(sanitizeColumnName("name", existing)).toBe("name1");

    existing.add("name1");
    expect(sanitizeColumnName("name", existing)).toBe("name2");
  });

  it("should truncate long names", () => {
    const existing = new Set<string>();
    const longName = "a".repeat(100);
    const result = sanitizeColumnName(longName, existing);
    expect(result.length).toBeLessThanOrEqual(64);
  });

  it("should collapse multiple underscores", () => {
    const existing = new Set<string>();
    expect(sanitizeColumnName("first___name", existing)).toBe("firstName");
    expect(sanitizeColumnName("  spaced  out  ", existing)).toBe("spacedOut");
  });
});

describe("sanitizeColumnNames", () => {
  it("should sanitize an array of names with deduplication", () => {
    const result = sanitizeColumnNames([
      "First Name",
      "Last Name",
      "First Name",
      "first_name",
    ]);
    expect(result).toEqual([
      "firstName",
      "lastName",
      "firstName1",
      "firstName2",
    ]);
  });

  it("should handle empty array", () => {
    expect(sanitizeColumnNames([])).toEqual([]);
  });

  it("should handle mixed names", () => {
    const result = sanitizeColumnNames([
      "Product ID",
      "price ($)",
      "2024 Sales",
      "select",
    ]);
    expect(result[0]).toBe("productId");
    expect(result[1]).toBe("price");
    expect(result[2]).toBe("col2024Sales");
    expect(result[3]).toBe("colSelect");
  });
});
