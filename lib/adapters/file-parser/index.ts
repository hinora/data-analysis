/**
 * File Parser Adapter Factory
 *
 * Maps file formats to parser implementations.
 * Entry point for all file parsing operations.
 */

import { CsvParser } from "./csv.parser";
import { PdfParser } from "./pdf.parser";
import type { FileParserAdapter } from "./types";
import { XlsmParser } from "./xlsm.parser";

// Export parsers
export { CsvParser } from "./csv.parser";
export { PdfParser } from "./pdf.parser";
// Export types
export type {
  ColumnMapping,
  FileParserAdapter,
  ParsedDataset,
  ParsedTextChunk,
  ParseError,
  ParseParams,
  ParseResult,
} from "./types";
// Export utilities
export {
  sanitizeColumnName,
  sanitizeColumnNames,
} from "./utils/column-sanitizer";
export type { ChunkOptions } from "./utils/text-chunker";
export { chunkText, normalizeExtractedText } from "./utils/text-chunker";
export type { InferredType } from "./utils/type-inferrer";
export { inferColumnType } from "./utils/type-inferrer";
export { XlsmParser } from "./xlsm.parser";

/** Singleton parser instances */
const parsers: FileParserAdapter[] = [
  new CsvParser(),
  new PdfParser(),
  new XlsmParser(),
];

/** Format-to-parser mapping */
const formatMap = new Map<string, FileParserAdapter>();

for (const parser of parsers) {
  for (const format of parser.supportedFormats()) {
    formatMap.set(format.toLowerCase(), parser);
  }
}

/**
 * Get the appropriate parser for a file format
 *
 * @param filenameOrExtension - Filename or extension (e.g., "report.pdf" or ".pdf")
 * @returns File parser adapter, or null if format is unsupported
 */
export function getParser(
  filenameOrExtension: string,
): FileParserAdapter | null {
  const ext = filenameOrExtension.includes(".")
    ? `.${filenameOrExtension.split(".").pop()?.toLowerCase()}`
    : filenameOrExtension.toLowerCase();

  return formatMap.get(ext) || null;
}

/**
 * List all supported file extensions
 */
export function getSupportedFormats(): string[] {
  return Array.from(formatMap.keys());
}
