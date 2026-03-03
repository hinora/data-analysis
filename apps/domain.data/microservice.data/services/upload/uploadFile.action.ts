/**
 * Upload File Action
 *
 * Handles file upload for a session:
 * 1. Validates file type/size
 * 2. Computes SHA-256 hash and checks for duplicates
 * 3. Saves original file to disk
 * 4. Parses via FileParserAdapter → creates Dataset(s) and DataRecords/TextChunks
 * 5. Generates embeddings for text chunks
 * 6. Emits metadata.generateMetadata event for metadata generation
 * 7. Updates session datasetCount via cross-service call
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { TypedContext } from "core.lib/__generated__";
import { getParser, getSupportedFormats } from "core.lib/adapters/file-parser";
import type { ParsedDataset } from "core.lib/adapters/file-parser/types";
import { defineAction } from "core.lib/broker";
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

export interface UploadFileParams {
  sessionId: string;
}

export interface UploadFileResult {
  originalFileId: string;
  datasets: Array<{
    id: string;
    name: string;
    datasetType: string;
    rowCount: number;
    columnCount: number | null;
  }>;
}

const MAX_FILE_SIZE =
  (Number(process.env.MAX_FILE_SIZE_MB) || 100) * 1024 * 1024;
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.resolve(process.cwd(), "../../data/uploads");
const SUPPORTED_MIME_TYPES: Record<string, FileType> = {
  "text/csv": FileType.CSV,
  "application/vnd.ms-excel": FileType.CSV,
  "application/pdf": FileType.PDF,
  "application/vnd.ms-excel.sheet.macroEnabled.12": FileType.XLSM,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    FileType.XLSM,
};

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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default defineAction<UploadFileParams, UploadFileResult>({
  rest: "POST /:sessionId/upload",

  // No params validation — in multipart mode ctx.params is the file stream,
  // route params live in ctx.meta.$multipart.

  async handler(ctx: TypedContext<UploadFileParams>) {
    const meta = ctx.meta as Record<string, unknown>;
    const multipart = (meta.$multipart ?? {}) as Record<string, unknown>;

    // In multipart mode, route params may be in $multipart, meta.$params, or meta directly
    const metaParams = (meta.$params ?? {}) as Record<string, unknown>;
    const paramsObj =
      typeof ctx.params === "object" &&
      ctx.params !== null &&
      !(ctx.params as unknown as Record<string, unknown>).pipe
        ? (ctx.params as unknown as Record<string, unknown>)
        : {};
    const sessionId = (multipart.sessionId ??
      metaParams.sessionId ??
      meta.sessionId ??
      paramsObj.sessionId) as string;

    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      throw new Errors.MoleculerClientError(
        "Invalid or missing sessionId",
        400,
        "INVALID_SESSION_ID",
        { sessionId },
      );
    }
    const filename = (multipart.filename ||
      meta.filename ||
      "unknown") as string;
    const mimetype = (multipart.mimetype || meta.mimetype || "") as string;

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

    // Read the file data from the stream
    const chunks: Buffer[] = [];
    const paramsRecord = ctx.params as unknown as Record<string, unknown>;
    if (ctx.params && typeof paramsRecord.pipe === "function") {
      // Stream-based upload
      for await (const chunk of ctx.params as unknown as AsyncIterable<Buffer>) {
        chunks.push(Buffer.from(chunk));
      }
    } else if (multipart.data) {
      chunks.push(Buffer.from(multipart.data as Buffer));
    } else {
      throw new Errors.MoleculerClientError(
        "No file data received",
        400,
        "NO_FILE_DATA",
      );
    }

    const fileBuffer = Buffer.concat(chunks);

    // Validate file size
    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw new Errors.MoleculerClientError(
        `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        413,
        "FILE_TOO_LARGE",
        { size: fileBuffer.length, maxSize: MAX_FILE_SIZE },
      );
    }

    // Compute hash for duplicate detection
    const fileHash = computeHash(fileBuffer);

    // Check for duplicates
    const originalFileRepo = dataSource.getRepository(OriginalFile);
    const existing = await originalFileRepo.findOneBy({
      sessionId,
      fileHash,
    });

    if (existing) {
      throw new Errors.MoleculerClientError(
        "This file has already been uploaded to this session",
        409,
        "DUPLICATE_FILE",
        { filename, fileHash },
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
      sessionId,
      filename,
      mimeType: mimetype || `application/${fileType}`,
      fileSize: fileBuffer.length,
      fileHash,
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

    const createdDatasets: UploadFileResult["datasets"] = [];

    for (const parsedDataset of parseResult.datasets) {
      const isStructured = parsedDataset.datasetType === "structured-table";
      const datasetName = buildDatasetName(filename, parsedDataset);

      const dataset = datasetRepo.create({
        sessionId,
        originalFileId: savedFile.id,
        name: datasetName,
        fileType,
        datasetType: isStructured
          ? DatasetType.STRUCTURED_TABLE
          : DatasetType.UNSTRUCTURED_TEXT,
        metadataStatus: MetadataStatus.PENDING,
        rowCount: isStructured
          ? parsedDataset.rows?.length || 0
          : parsedDataset.textChunks?.length || 0,
        columnCount: isStructured
          ? parsedDataset.columnMappings?.length || null
          : null,
        columnMappings: isStructured
          ? parsedDataset.columnMappings || null
          : null,
        sheetName: parsedDataset.sheetName || null,
        tablePosition: parsedDataset.tablePosition ?? null,
        sourceFileHash: fileHash,
        importedAt: new Date(),
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
              datasetId: savedDataset.id,
              sessionId,
              data: row,
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
              datasetId: savedDataset.id,
              sessionId,
              content: chunk.content,
              sourcePage: chunk.sourcePage || null,
              sourceSection: chunk.sourceSection || null,
              orderIndex: i + batchIndex,
            }),
          );
          await textChunkRepo.save(records);
        }
      }

      createdDatasets.push({
        id: savedDataset.id,
        name: savedDataset.name,
        datasetType: savedDataset.datasetType,
        rowCount: savedDataset.rowCount,
        columnCount: savedDataset.columnCount,
      });
    }

    // Emit a single metadata.generateMetadata event with all datasets.
    // The handler processes them sequentially (one by one) to limit Ollama load.
    // Do NOT await — ctx.emit() waits for local handlers to complete.
    ctx
      .emit("metadata.generateMetadata", {
        sessionId,
        datasets: createdDatasets.map((d) => ({
          datasetId: d.id,
          datasetType: d.datasetType,
          name: d.name,
        })),
      })
      .catch((err: unknown) => {
        ctx.broker.logger.error(
          "Failed to emit metadata.generateMetadata:",
          err,
        );
      });

    // Update session dataset count via cross-service call.
    // Use broker.call() instead of ctx.call() to create a fresh context
    // with its own timeout — ctx.call() inherits the parent context's remaining
    // timeout, which may already be exhausted after file parsing + DB inserts.
    try {
      await ctx.broker.call("session.updateSessionStatus", {
        sessionId,
        trigger: "dataset-imported",
        count: createdDatasets.length,
      });
    } catch (err) {
      ctx.broker.logger.warn(
        "Failed to update session status (analysis microservice may not be running):",
        err,
      );
    }

    ctx.broker.logger.info(
      `Upload complete: ${filename} → ${createdDatasets.length} dataset(s) for session ${sessionId}`,
    );

    return {
      originalFileId: savedFile.id,
      datasets: createdDatasets,
    };
  },
});

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
