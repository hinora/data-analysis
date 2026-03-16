/**
 * PDF Parser Adapter
 *
 * Uses pdf-parse for text extraction and tabula-js for table extraction.
 * Returns structured-table datasets for tables and unstructured-text datasets
 * for narrative text.
 */

// biome-ignore lint/style/useNodejsImportProtocol: compatibility
import * as fs from "fs";
// biome-ignore lint/style/useNodejsImportProtocol: compatibility
import * as os from "os";
// biome-ignore lint/style/useNodejsImportProtocol: compatibility
import * as path from "path";
import { PDFParse } from "pdf-parse";
import type {
  ColumnMapping,
  FileParserAdapter,
  ParsedDataset,
  ParseError,
  ParseParams,
  ParseResult,
} from "./types";
import { sanitizeColumnNames } from "./utils/column-sanitizer";
import { semanticChunkText } from "./utils/text-chunker";
import { inferColumnType } from "./utils/type-inferrer";

export class PdfParser implements FileParserAdapter {
  supportedFormats(): string[] {
    return [".pdf"];
  }

  async parse(params: ParseParams): Promise<ParseResult> {
    const { buffer, filename } = params;
    const errors: ParseError[] = [];
    const datasets: ParsedDataset[] = [];

    // Extract text via pdf-parse
    let pdfText: string;
    try {
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();
      pdfText = textResult.text || "";
      await parser.destroy();
    } catch (err) {
      errors.push({
        message: `PDF parse error: ${err instanceof Error ? err.message : String(err)}`,
        severity: "error",
      });
      return { datasets: [], errors };
    }

    // Check for scanned/image-only PDFs
    if (!pdfText || pdfText.trim().length === 0) {
      errors.push({
        message:
          "PDF contains no extractable text. Scanned/image-only PDFs are not supported (OCR is out of scope).",
        severity: "error",
      });
      return { datasets: [], errors };
    }

    const displayName = filename.replace(/\.pdf$/i, "");

    // Try to extract tables via tabula-js
    let tabulaTables: string[][] = [];
    try {
      tabulaTables = await this.extractTablesWithTabula(buffer);
    } catch (err) {
      // Tabula requires JRE — if not available, skip table extraction
      errors.push({
        message: `Table extraction skipped: ${err instanceof Error ? err.message : String(err)}`,
        severity: "warning",
      });
    }

    // If tables were found, create structured datasets
    if (tabulaTables.length > 0) {
      for (let i = 0; i < tabulaTables.length; i++) {
        const tableData = tabulaTables[i];
        if (!tableData || tableData.length < 2) continue;

        // First row = headers, rest = data
        // tabula returns CSV rows as strings, need to re-parse
        const tableDataset = this.parseTableData(
          tableData,
          `${displayName} — Table ${i + 1}`,
        );
        if (tableDataset) {
          datasets.push(tableDataset);
        }
      }
    }

    // Create unstructured text dataset from the full text
    const textChunks = await semanticChunkText(pdfText, {
      chunkSize: 1500,
      overlap: 100,
    });

    if (textChunks.length > 0) {
      datasets.push({
        datasetType: "unstructured-text",
        name: `${displayName} — Text`,
        textChunks,
      });
    }

    return { datasets, errors };
  }

  /**
   * Extract tables from PDF using tabula-js
   */
  private async extractTablesWithTabula(buffer: Buffer): Promise<string[][]> {
    // tabula-js requires a file path, so write buffer to temp file
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `pdf-parse-${Date.now()}.pdf`);

    try {
      fs.writeFileSync(tmpFile, buffer);

      // Dynamic import to handle missing JRE gracefully
      const tabula = require("tabula-js");
      const t = tabula(tmpFile, { pages: "all", guess: true });

      return new Promise<string[][]>((resolve, reject) => {
        t.extractCsv((err: Error | null, data: string) => {
          if (err) {
            reject(err);
            return;
          }
          // Split CSV output into tables (separated by empty lines)
          const tables = data
            .split("\n\n")
            .map((table: string) =>
              table
                .split("\n")
                .map((row: string) => row.trim())
                .filter((row: string) => row.length > 0),
            )
            .filter((table: string[]) => table.length > 0);
          resolve(tables);
        });
      });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Parse raw table data (CSV rows) into a structured dataset
   */
  private parseTableData(
    csvRows: string[],
    name: string,
  ): ParsedDataset | null {
    if (csvRows.length < 2) return null;

    // Parse CSV rows manually (simple comma split, handles basic cases)
    const parseRow = (row: string): string[] =>
      row.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));

    const rawHeaders = parseRow(csvRows[0]);
    if (rawHeaders.length === 0) return null;

    const sanitizedNames = sanitizeColumnNames(rawHeaders);
    const dataRows = csvRows.slice(1).map(parseRow);

    // Build column mappings
    const columnMappings: ColumnMapping[] = rawHeaders.map(
      (original, index) => {
        const values = dataRows.map((row) => row[index]);
        return {
          camelCase: sanitizedNames[index],
          detectedType: inferColumnType(values),
          order: index,
          original,
        };
      },
    );

    // Build data rows
    const rows = dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < sanitizedNames.length; i++) {
        const val = row[i];
        // Try to convert to number if column type is numeric
        if (columnMappings[i]?.detectedType === "number" && val) {
          const num = Number(val.replace(/[$€£¥,]/g, ""));
          obj[sanitizedNames[i]] = Number.isNaN(num) ? val : num;
        } else {
          obj[sanitizedNames[i]] = val ?? null;
        }
      }
      return obj;
    });

    return {
      columnMappings,
      datasetType: "structured-table",
      name,
      rows,
    };
  }
}
