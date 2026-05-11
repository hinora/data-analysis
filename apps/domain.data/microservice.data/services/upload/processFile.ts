/**
 * Shared file processing logic for upload actions.
 *
 * Validates, hashes, saves, parses, and creates datasets from a single file.
 * Used by both uploadFile (single) and uploadFiles (multi) actions.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getParser, getSupportedFormats } from "core.lib/adapters/file-parser";
import type { ParsedDataset } from "core.lib/adapters/file-parser/types";
import type { LoggerInstance } from "moleculer";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import {
  Dataset,
  DatasetType,
  FileType,
  MetadataStatus,
} from "../../db/dataset.entity";
import { OriginalFile } from "../../db/original-file.entity";
import { TextChunk } from "../../db/text-chunk.entity";

export const MAX_FILE_SIZE =
  (Number(process.env.MAX_FILE_SIZE_MB) || 100) * 1024 * 1024;
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.resolve(process.cwd(), "../../data/uploads");
const SUPPORTED_MIME_TYPES: Record<string, FileType> = {
  "application/pdf": FileType.PDF,
  "application/vnd.ms-excel": FileType.CSV,
  "application/vnd.ms-excel.sheet.macroEnabled.12": FileType.XLSM,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    FileType.XLSM,
  "text/csv": FileType.CSV,
};

export interface ProcessFileParams {
  fileBuffer: Buffer;
  filename: string;
  logger: LoggerInstance;
  mimetype: string;
  sessionId: string;
}

export interface ProcessFileResult {
  datasets: Array<{
    columnCount: number | null;
    datasetType: string;
    id: string;
    name: string;
    rowCount: number;
  }>;
  originalFileId: string;
}

function getFileTypeFromExtension(filename: string): FileType | null {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".csv":
      return FileType.CSV;
    case ".pdf":
      return FileType.PDF;
    case ".xlsm":
    case ".xlsx":
      return FileType.XLSM;
    default:
      return null;
  }
}

function computeHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildDatasetName(filename: string, dataset: ParsedDataset): string {
  const baseName = path.basename(filename, path.extname(filename));
  if (dataset.sheetName) {
    const tablePos =
      dataset.tablePosition != null
        ? ` — Table ${dataset.tablePosition + 1}`
        : "";
    return `${baseName} — ${dataset.sheetName}${tablePos}`;
  }
  if (dataset.datasetType === "unstructured-text") {
    return `${baseName} — Text`;
  }
  return baseName;
}

/**
 * Processes a single uploaded file: validates, hashes, saves to disk,
 * parses content, and creates Dataset + DataRecord/TextChunk entries.
 *
 * Does NOT emit metadata events or update session status — callers handle that.
 */
export async function processUploadedFile(
  params: ProcessFileParams,
): Promise<ProcessFileResult> {
  const { fileBuffer, filename, logger, mimetype, sessionId } = params;

  // Determine file type
  const fileType =
    SUPPORTED_MIME_TYPES[mimetype] || getFileTypeFromExtension(filename);

  if (!fileType) {
    throw new Errors.MoleculerClientError(
      `Unsupported file type. Supported formats: ${getSupportedFormats().join(", ")}`,
      400,
      "UNSUPPORTED_FILE_TYPE",
      { filename, mimetype },
    );
  }

  // Validate file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Errors.MoleculerClientError(
      `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      413,
      "FILE_TOO_LARGE",
      { maxSize: MAX_FILE_SIZE, size: fileBuffer.length },
    );
  }

  // Compute hash for duplicate detection
  const fileHash = computeHash(fileBuffer);

  // Check for duplicates
  const originalFileRepo = dataSource.getRepository(OriginalFile);
  const existing = await originalFileRepo.findOneBy({
    fileHash,
    sessionId,
  });

  if (existing) {
    throw new Errors.MoleculerClientError(
      "This file has already been uploaded to this session",
      409,
      "DUPLICATE_FILE",
      { fileHash, filename },
    );
  }

  // Save file to disk
  const sessionDir = path.join(UPLOAD_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  const storagePath = path.join(sessionDir, `${fileHash}-${filename}`);
  fs.writeFileSync(storagePath, fileBuffer);

  // Create OriginalFile record
  const originalFile = originalFileRepo.create({
    fileHash,
    fileSize: fileBuffer.length,
    filename,
    mimeType: mimetype || `application/${fileType}`,
    sessionId,
    storagePath,
  });
  const savedFile = await originalFileRepo.save(originalFile);

  // Parse the file using the file parser adapter
  const parser = getParser(filename);
  if (!parser) {
    throw new Errors.MoleculerClientError(
      `No parser available for file: ${filename}`,
      400,
      "NO_PARSER",
      { filename },
    );
  }
  const parseResult = await parser.parse({ buffer: fileBuffer, filename });

  if (parseResult.errors.length > 0 && parseResult.datasets.length === 0) {
    throw new Errors.MoleculerClientError(
      `Failed to parse file: ${parseResult.errors.map((e) => e.message).join("; ")}`,
      422,
      "PARSE_ERROR",
      { errors: parseResult.errors },
    );
  }

  // Create datasets and insert data
  const datasetRepo = dataSource.getRepository(Dataset);
  const dataRecordRepo = dataSource.getRepository(DataRecord);
  const textChunkRepo = dataSource.getRepository(TextChunk);

  const createdDatasets: ProcessFileResult["datasets"] = [];

  for (const parsedDataset of parseResult.datasets) {
    const isStructured = parsedDataset.datasetType === "structured-table";
    const datasetName = buildDatasetName(filename, parsedDataset);

    const dataset = datasetRepo.create({
      columnCount: isStructured
        ? parsedDataset.columnMappings?.length || null
        : null,
      columnMappings: isStructured
        ? parsedDataset.columnMappings || null
        : null,
      datasetType: isStructured
        ? DatasetType.STRUCTURED_TABLE
        : DatasetType.UNSTRUCTURED_TEXT,
      fileType,
      importedAt: new Date(),
      metadataStatus: MetadataStatus.PENDING,
      name: datasetName,
      originalFileId: savedFile.id,
      rowCount: isStructured
        ? parsedDataset.rows?.length || 0
        : parsedDataset.textChunks?.length || 0,
      sessionId,
      sheetName: parsedDataset.sheetName || null,
      sourceFileHash: fileHash,
      tablePosition: parsedDataset.tablePosition ?? null,
    });

    const savedDataset = await datasetRepo.save(dataset);

    // Insert data records (structured) or text chunks (unstructured)
    if (isStructured && parsedDataset.rows && parsedDataset.rows.length > 0) {
      // Bulk insert in batches of 500
      const batchSize = 500;
      for (let i = 0; i < parsedDataset.rows.length; i += batchSize) {
        const batch = parsedDataset.rows.slice(i, i + batchSize);
        const records = batch.map((row) =>
          dataRecordRepo.create({
            data: row,
            datasetId: savedDataset.id,
            sessionId,
          }),
        );
        await dataRecordRepo.save(records);
      }
    }

    if (
      !isStructured &&
      parsedDataset.textChunks &&
      parsedDataset.textChunks.length > 0
    ) {
      // Bulk insert in batches of 500 to avoid exceeding PostgreSQL's
      // parameter limit (large PDFs can produce thousands of chunks)
      const chunkBatchSize = 500;
      for (
        let i = 0;
        i < parsedDataset.textChunks.length;
        i += chunkBatchSize
      ) {
        const batch = parsedDataset.textChunks.slice(i, i + chunkBatchSize);
        const records = batch.map((chunk, batchIndex) =>
          textChunkRepo.create({
            content: chunk.content,
            datasetId: savedDataset.id,
            orderIndex: i + batchIndex,
            sessionId,
            sourcePage: chunk.sourcePage || null,
            sourceSection: chunk.sourceSection || null,
          }),
        );
        await textChunkRepo.save(records);
      }
    }

    createdDatasets.push({
      columnCount: savedDataset.columnCount,
      datasetType: savedDataset.datasetType,
      id: savedDataset.id,
      name: savedDataset.name,
      rowCount: savedDataset.rowCount,
    });
  }

  logger.info(
    `Processed file: ${filename} → ${createdDatasets.length} dataset(s) for session ${sessionId}`,
  );

  return {
    datasets: createdDatasets,
    originalFileId: savedFile.id,
  };
}
