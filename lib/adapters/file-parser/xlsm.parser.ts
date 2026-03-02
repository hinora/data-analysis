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
   * Detect separate tables within a sheet by scanning for blank row boundaries
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

    // Don't forget the last table
    if (currentTable.length > 0) {
      tables.push(currentTable);
    }

    return tables;
  }

  /**
   * Build a ParsedDataset from a table's array-of-arrays
   */
  private buildDataset(
    table: unknown[][],
    name: string,
    sheetName: string,
    tablePosition: number | undefined,
    errors: ParseError[],
  ): ParsedDataset | null {
    if (table.length < 1) return null;

    // First row = headers
    const rawHeaders = table[0].map((h) =>
      h !== null && h !== undefined ? String(h).trim() : "",
    );

    // Filter out empty headers
    const validColumns = rawHeaders
      .map((h, i) => ({ header: h, index: i }))
      .filter((col) => col.header.length > 0);

    if (validColumns.length === 0) {
      errors.push({
        message: `No valid headers found in ${name}`,
        severity: "warning",
      });
      return null;
    }

    const headers = validColumns.map((c) => c.header);
    const sanitizedNames = sanitizeColumnNames(headers);

    const dataRows = table.slice(1);

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

    // Build data rows
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
}
