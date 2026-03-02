/**
 * CSV Parser Adapter
 *
 * Uses papaparse with auto-delimiter detection and header extraction.
 * Returns a single structured-table dataset.
 */

import Papa from "papaparse";
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

export class CsvParser implements FileParserAdapter {
  supportedFormats(): string[] {
    return [".csv", ".tsv", ".txt"];
  }

  async parse(params: ParseParams): Promise<ParseResult> {
    const { buffer, filename } = params;
    const csvString = buffer.toString("utf-8");
    const errors: ParseError[] = [];

    const result = Papa.parse(csvString, {
      dynamicTyping: true,
      header: true,
      skipEmptyLines: true,
    });

    // Collect parse errors
    for (const err of result.errors) {
      errors.push({
        message: `${err.type}: ${err.message}`,
        row: err.row !== undefined ? err.row + 1 : undefined,
        severity: err.type === "FieldMismatch" ? "warning" : "error",
      });
    }

    const rawHeaders = result.meta.fields || [];
    if (rawHeaders.length === 0) {
      errors.push({
        message: "No headers detected in CSV file",
        severity: "error",
      });
      return { datasets: [], errors };
    }

    // Sanitize column names
    const sanitizedNames = sanitizeColumnNames(rawHeaders);

    // Build column mappings with type inference
    const columnMappings: ColumnMapping[] = rawHeaders.map(
      (original, index) => {
        const values = (result.data as Record<string, unknown>[]).map(
          (row) => row[original],
        );
        return {
          camelCase: sanitizedNames[index],
          detectedType: inferColumnType(values),
          order: index,
          original,
        };
      },
    );

    // Build data rows using camelCase keys
    const rows = (result.data as Record<string, unknown>[]).map((row) => {
      const sanitizedRow: Record<string, unknown> = {};
      for (let i = 0; i < rawHeaders.length; i++) {
        sanitizedRow[sanitizedNames[i]] = row[rawHeaders[i]];
      }
      return sanitizedRow;
    });

    // Strip extension from filename for display name
    const displayName = filename.replace(/\.(csv|tsv|txt)$/i, "");

    const dataset: ParsedDataset = {
      columnMappings,
      datasetType: "structured-table",
      name: displayName,
      rows,
    };

    return { datasets: [dataset], errors };
  }
}
