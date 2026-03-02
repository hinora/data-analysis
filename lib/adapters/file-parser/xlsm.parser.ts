/**
 * XLSM Parser Adapter
 *
 * Uses xlsx/SheetJS to parse XLSM files with multi-table detection per sheet.
 * Scans for blank row/column boundaries to detect separate tables within sheets.
 */

import * as XLSX from "xlsx";
import type {
  ColumnMapping,
  FileParserAdapter,
  ParsedDataset,
  ParseError,
  ParseParams,
  ParseResult,
} from "./types";
import { sanitizeColumnNames } from "./utils/column-sanitizer";
import { inferColumnType } from "./utils/type-inferrer";

export class XlsmParser implements FileParserAdapter {
  supportedFormats(): string[] {
    return [".xlsm", ".xlsx", ".xls"];
  }

  async parse(params: ParseParams): Promise<ParseResult> {
    const { buffer, filename } = params;
    const errors: ParseError[] = [];
    const datasets: ParsedDataset[] = [];

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, {
        cellDates: true,
        cellFormula: false,
        type: "buffer",
      });
    } catch (err) {
      errors.push({
        message: `XLSM parse error: ${err instanceof Error ? err.message : String(err)}`,
        severity: "error",
      });
      return { datasets: [], errors };
    }

    const displayName = filename.replace(/\.(xlsm|xlsx|xls)$/i, "");

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      // Read sheet as array of arrays for multi-table detection
      const aoa: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
      });

      if (aoa.length === 0) continue;

      // Fill merged cells so values propagate across merge ranges
      this.fillMergedCells(aoa, worksheet);

      // Detect multiple tables within the sheet
      const tables = this.detectTables(aoa);

      if (tables.length === 0) continue;

      for (let tableIdx = 0; tableIdx < tables.length; tableIdx++) {
        const table = tables[tableIdx];
        if (table.length < 2) continue; // Need at least headers + 1 row

        const tableName =
          tables.length === 1
            ? `${displayName} — ${sheetName}`
            : `${displayName} — ${sheetName} — Table ${tableIdx + 1}`;

        const dataset = this.buildDataset(
          table,
          tableName,
          sheetName,
          tables.length > 1 ? tableIdx + 1 : undefined,
          errors,
        );

        if (dataset) {
          datasets.push(dataset);
        }
      }
    }

    if (datasets.length === 0) {
      errors.push({
        message: "No data tables found in the XLSM file",
        severity: "error",
      });
    }

    return { datasets, errors };
  }

  /**
   * Detect separate tables within a sheet by scanning for blank row boundaries.
   * Each contiguous block of non-blank rows becomes one candidate table.
   * Width-aware header detection in buildDataset handles mixed narrow/wide blocks.
   */
  private detectTables(aoa: unknown[][]): unknown[][][] {
    const tables: unknown[][][] = [];
    let currentTable: unknown[][] = [];

    for (const row of aoa) {
      const isBlank = row.every(
        (cell) =>
          cell === null || cell === undefined || String(cell).trim() === "",
      );

      if (isBlank) {
        if (currentTable.length > 0) {
          tables.push(currentTable);
          currentTable = [];
        }
      } else {
        currentTable.push(row);
      }
    }

    if (currentTable.length > 0) {
      tables.push(currentTable);
    }

    return tables;
  }

  /**
   * Build a ParsedDataset from a table's array-of-arrays.
   * Uses smart header detection to skip title rows and combine multi-row headers.
   */
  private buildDataset(
    table: unknown[][],
    name: string,
    sheetName: string,
    tablePosition: number | undefined,
    errors: ParseError[],
  ): ParsedDataset | null {
    if (table.length < 1) return null;

    // Find the actual header row (skip title/metadata/data-only rows)
    const headerRowIdx = this.findHeaderRowIndex(table);

    // -1 means no valid header row found (e.g. all rows are numeric data)
    if (headerRowIdx < 0) {
      return null;
    }

    // Detect multi-row header span
    const headerRowCount = this.countHeaderRows(table, headerRowIdx);

    // Combine multi-row headers into a single header array
    const headerSlice = table.slice(
      headerRowIdx,
      headerRowIdx + headerRowCount,
    );
    const combinedHeaders = this.combineHeaderRows(headerSlice);

    // Data starts after all header rows
    const allDataRows = table.slice(headerRowIdx + headerRowCount);

    // Include columns that have a header OR contain data (assign generated names)
    const validColumns = combinedHeaders
      .map((h, i) => ({ header: h, index: i }))
      .filter((col) => {
        if (col.header.length > 0) return true;
        // Check if this column has any non-empty data
        return allDataRows.some((row) => {
          const v = row[col.index];
          return v !== null && v !== undefined && String(v).trim() !== "";
        });
      })
      .map((col) => ({
        ...col,
        header: col.header.length > 0 ? col.header : `column${col.index + 1}`,
      }));

    if (validColumns.length === 0) {
      errors.push({
        message: `No valid headers found in ${name}`,
        severity: "warning",
      });
      return null;
    }

    const headers = validColumns.map((c) => c.header);
    const sanitizedNames = sanitizeColumnNames(headers);

    // Filter out empty data rows (rows where all mapped cells are null/empty)
    const dataRows = allDataRows.filter((row) =>
      validColumns.some((col) => {
        const value = row[col.index];
        return (
          value !== null && value !== undefined && String(value).trim() !== ""
        );
      }),
    );

    if (dataRows.length === 0) {
      errors.push({
        message: `No data rows found in ${name}`,
        severity: "warning",
      });
      return null;
    }

    // Build column mappings
    const columnMappings: ColumnMapping[] = headers.map((original, idx) => {
      const colIndex = validColumns[idx].index;
      const values = dataRows.map((row) => row[colIndex]);
      return {
        camelCase: sanitizedNames[idx],
        detectedType: inferColumnType(values),
        order: idx,
        original,
      };
    });

    // Build data row objects
    const rows = dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let idx = 0; idx < validColumns.length; idx++) {
        const colIndex = validColumns[idx].index;
        const value = row[colIndex] ?? null;
        obj[sanitizedNames[idx]] = value;
      }
      return obj;
    });

    return {
      columnMappings,
      datasetType: "structured-table",
      name,
      rows,
      sheetName,
      tablePosition,
    };
  }

  /**
   * Combine multiple header rows into a single header array.
   * Joins distinct non-empty values per column with a space separator.
   */
  private combineHeaderRows(headerRows: unknown[][]): string[] {
    const maxCols = Math.max(...headerRows.map((r) => r.length));
    const combined: string[] = [];

    for (let c = 0; c < maxCols; c++) {
      const parts: string[] = [];
      for (const row of headerRows) {
        const cell = c < row.length ? row[c] : null;
        if (cell === null || cell === undefined) continue;
        const text =
          cell instanceof Date
            ? this.formatDateValue(cell)
            : String(cell).trim();
        if (text !== "" && !parts.includes(text)) {
          parts.push(text);
        }
      }
      combined.push(parts.join(" "));
    }

    return combined;
  }

  /**
   * Count how many consecutive rows starting from headerStart form the header.
   * Stops when a row has predominantly numeric values (indicating a data row).
   */
  private countHeaderRows(table: unknown[][], headerStart: number): number {
    const MAX_HEADER_ROWS = 4;
    let count = 1;

    for (
      let i = headerStart + 1;
      i < Math.min(headerStart + MAX_HEADER_ROWS, table.length);
      i++
    ) {
      const row = table[i];
      const nonEmpty = row.filter(
        (cell) =>
          cell !== null && cell !== undefined && String(cell).trim() !== "",
      );

      if (nonEmpty.length < 3) break;

      const numericCount = nonEmpty.filter(
        (cell) => typeof cell === "number",
      ).length;

      // More than half numeric values indicates a data row
      if (numericCount / nonEmpty.length > 0.5) break;

      count++;
    }

    return count;
  }

  /**
   * Fill merged cell regions so every cell in a merge range holds the top-left value.
   * Ensures merged headers and category labels propagate to all spanned cells.
   */
  private fillMergedCells(aoa: unknown[][], worksheet: XLSX.WorkSheet): void {
    const merges = worksheet["!merges"];
    if (!merges || merges.length === 0) return;

    for (const merge of merges) {
      const { e, s } = merge;
      const value = aoa[s.r]?.[s.c];
      if (value === null || value === undefined) continue;

      for (let r = s.r; r <= e.r; r++) {
        if (!aoa[r]) continue;
        for (let c = s.c; c <= e.c; c++) {
          if (r === s.r && c === s.c) continue;
          while (aoa[r].length <= c) {
            aoa[r].push(null);
          }
          aoa[r][c] = value;
        }
      }
    }
  }

  /**
   * Find the index of the actual header row within a table block.
   * Uses width-aware detection: the header row width must be proportional
   * to the table's maximum row width. Skips narrow metadata rows,
   * merged title rows (all identical values), and data rows (mostly numeric).
   *
   * @returns Row index, or -1 if no valid header row found.
   */
  private findHeaderRowIndex(table: unknown[][]): number {
    const MIN_UNIQUE_VALUES = 2;

    // Calculate per-row widths (non-empty cell counts)
    const rowWidths = table.map(
      (row) =>
        row.filter(
          (cell) =>
            cell !== null && cell !== undefined && String(cell).trim() !== "",
        ).length,
    );

    const maxWidth = Math.max(...rowWidths);
    // Header must have at least 40% of the widest row, minimum 3
    const minHeaderWidth = Math.max(3, Math.floor(maxWidth * 0.4));

    for (let i = 0; i < table.length; i++) {
      if (rowWidths[i] < minHeaderWidth) continue;

      const row = table[i];
      const nonEmpty = row.filter(
        (cell) =>
          cell !== null && cell !== undefined && String(cell).trim() !== "",
      );

      // Skip merged title rows: all non-empty cells are identical
      const uniqueValues = new Set(
        nonEmpty.map((c) =>
          c instanceof Date ? this.formatDateValue(c) : String(c).trim(),
        ),
      );
      if (uniqueValues.size < MIN_UNIQUE_VALUES) continue;

      // Skip data rows: predominantly numeric values are data, not headers
      const numericCount = nonEmpty.filter(
        (cell) => typeof cell === "number",
      ).length;
      if (numericCount / nonEmpty.length > 0.5) continue;

      return i;
    }

    // No valid header row found — all wide rows are numeric data or titles
    return -1;
  }

  /**
   * Format a Date value as dd/MM/yyyy for use in headers
   */
  private formatDateValue(date: Date): string {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}
