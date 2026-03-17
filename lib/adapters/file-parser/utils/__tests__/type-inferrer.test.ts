/**
 * Tests for type-inferrer.ts
 */

import { inferColumnType } from "../type-inferrer";

describe("inferColumnType", () => {
  it("should detect number columns", () => {
    expect(inferColumnType(["1", "2", "3", "4", "5"])).toBe("number");
    expect(
      inferColumnType(["100.50", "200.75", "300.25", "400.99", "500.10"]),
    ).toBe("number");
    expect(inferColumnType(["$100", "$200", "$300"])).toBe("number");
    expect(inferColumnType(["€1,000", "€2,500"])).toBe("number");
  });

  it("should detect date columns", () => {
    expect(inferColumnType(["2025-01-15", "2025-02-20", "2025-03-10"])).toBe(
      "date",
    );
    expect(inferColumnType(["01/15/2025", "02/20/2025"])).toBe("date");
    expect(inferColumnType(["Jan 15, 2025", "Feb 20, 2025"])).toBe("date");
    expect(
      inferColumnType(["2025-01-15T10:30:00", "2025-02-20T14:00:00"]),
    ).toBe("date");
  });

  it("should detect boolean columns", () => {
    expect(inferColumnType(["true", "false", "true"])).toBe("boolean");
    expect(inferColumnType(["yes", "no", "yes", "no"])).toBe("boolean");
    expect(inferColumnType(["1", "0", "1", "0", "1"])).toBe("boolean");
    expect(inferColumnType(["T", "F", "T", "F"])).toBe("boolean");
    expect(inferColumnType(["Y", "N", "Y"])).toBe("boolean");
  });

  it("should detect string columns", () => {
    expect(inferColumnType(["hello", "world", "foo"])).toBe("string");
    expect(inferColumnType(["mixed", "123", "abc"])).toBe("string");
  });

  it("should return string for empty values", () => {
    expect(inferColumnType([])).toBe("string");
    expect(inferColumnType([null, undefined, ""])).toBe("string");
  });

  it("should use 80% threshold", () => {
    // 4 out of 5 are numbers = 80% → number
    expect(inferColumnType(["1", "2", "3", "4", "abc"])).toBe("number");
    // 3 out of 5 are numbers = 60% → string
    expect(inferColumnType(["1", "2", "3", "abc", "def"])).toBe("string");
  });

  it("should prioritize boolean over number", () => {
    // "1" and "0" match both boolean and number, but boolean takes priority
    expect(inferColumnType(["1", "0", "1", "0", "1"])).toBe("boolean");
  });

  it("should handle date formats with day-first patterns", () => {
    expect(inferColumnType(["01-15-2025", "02-20-2025"])).toBe("date");
    expect(inferColumnType(["15 Jan 2025", "20 Feb 2025"])).toBe("date");
  });

  it("should handle currency values as numbers", () => {
    expect(inferColumnType(["$1,234.56", "$7,890.12"])).toBe("number");
    expect(inferColumnType(["£500", "£1,000"])).toBe("number");
    expect(inferColumnType(["¥10000", "¥20000"])).toBe("number");
  });

  it("should limit samples to 100", () => {
    const largeSample = Array.from({ length: 200 }, (_, i) => String(i));
    // Should still work correctly even with 200 samples (uses first 100)
    expect(inferColumnType(largeSample)).toBe("number");
  });
});
