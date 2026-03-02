/**
 * File Parser Adapter Types
 *
 * Common interfaces for file parsing (CSV, PDF, XLSM).
 * Each parser implements FileParserAdapter.
 */

/**
 * A single column detected from a structured dataset
 */
export interface ColumnMapping {
  /** camelCase key used in JSONB data records */
  camelCase: string;
  /** Inferred data type */
  detectedType: "boolean" | "date" | "number" | "string";
  /** Column position (0-based) */
  order: number;
  /** Original column name from the file */
  original: string;
}

/**
 * A single dataset parsed from a file
 * One file can produce multiple datasets (e.g., multi-sheet XLSM)
 */
export interface ParsedDataset {
  /** Column name mappings (structured only) */
  columnMappings?: ColumnMapping[];
  /** Type of dataset */
  datasetType: "structured-table" | "unstructured-text";
  /** Display name for the dataset */
  name: string;
  /** Parsed data rows (structured) as objects with camelCase keys */
  rows?: Record<string, unknown>[];
  /** Sheet name (XLSM only) */
  sheetName?: string;
  /** Table position within a sheet (XLSM multi-table only) */
  tablePosition?: number;
  /** Parsed text chunks (unstructured) */
  textChunks?: ParsedTextChunk[];
}

/**
 * A chunk of text from an unstructured document
 */
export interface ParsedTextChunk {
  /** Text content */
  content: string;
  /** Order index within the document */
  orderIndex: number;
  /** Source page number (1-based, PDF only) */
  sourcePage?: number;
  /** Source section reference */
  sourceSection?: string;
}

/**
 * Errors encountered during parsing
 */
export interface ParseError {
  /** Column or field with the error */
  column?: string;
  /** Error message */
  message: string;
  /** Row number (1-based) where the error occurred */
  row?: number;
  /** Error severity */
  severity: "error" | "warning";
}

/**
 * Result from parsing a file
 */
export interface ParseResult {
  /** Extracted datasets */
  datasets: ParsedDataset[];
  /** Errors encountered */
  errors: ParseError[];
}

/**
 * Parameters for parsing a file
 */
export interface ParseParams {
  /** File content as a buffer */
  buffer: Buffer;
  /** Original filename (used for display names) */
  filename: string;
}

/**
 * File Parser Adapter interface
 * All file parsers (CSV, PDF, XLSM) implement this.
 */
export interface FileParserAdapter {
  /** Parse a file buffer into datasets */
  parse(params: ParseParams): Promise<ParseResult>;
  /** List of supported file extensions */
  supportedFormats(): string[];
}
