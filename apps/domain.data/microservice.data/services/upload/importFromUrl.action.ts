/**
 * Import From URL Action
 *
 * Fetches web page content from a given URL and imports it as an
 * unstructured-text dataset. Uses the existing webFetch tool (Puppeteer)
 * to render JavaScript-heavy pages, then chunks the text content
 * and stores it alongside an OriginalFile record.
 */

import * as crypto from "node:crypto";
import { semanticChunkText } from "core.lib/adapters/file-parser";
import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";
import {
  Dataset,
  DatasetType,
  FileType,
  MetadataStatus,
} from "../../db/dataset.entity";
import { OriginalFile } from "../../db/original-file.entity";
import { TextChunk } from "../../db/text-chunk.entity";

export interface ImportFromUrlParams {
  sessionId: string;
  url: string;
}

export interface ImportFromUrlResult {
  originalFileId: string;
  datasets: Array<{
    id: string;
    name: string;
    datasetType: string;
    rowCount: number;
    columnCount: number | null;
  }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default defineAction<ImportFromUrlParams, ImportFromUrlResult>({
  authentication: true,
  rest: "POST /:sessionId/import-url",

  params: {
    sessionId: { type: "string", min: 1 },
    url: { type: "string", min: 1 },
  },

  async handler(ctx: AuthenticatedContext<ImportFromUrlParams>) {
    const { sessionId, url } = ctx.params;
    const logger = ctx.broker.logger;

    // Validate sessionId
    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      throw new Errors.MoleculerClientError(
        "Invalid or missing sessionId",
        400,
        "INVALID_SESSION_ID",
        { sessionId },
      );
    }

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Errors.MoleculerClientError(
        `Invalid URL: ${url}`,
        400,
        "INVALID_URL",
      );
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Errors.MoleculerClientError(
        `Only http and https URLs are supported, got: ${parsed.protocol}`,
        400,
        "UNSUPPORTED_PROTOCOL",
      );
    }

    logger.info(`[importFromUrl] url="${url}" for session ${sessionId}`);

    // Fetch web page content via the existing webFetch tool
    let fetchResult: { content: string; title: string; url: string };
    try {
      fetchResult = await ctx.call("tools.webFetch", {
        url,
        maxLength: 200_000,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch URL";
      throw new Errors.MoleculerClientError(
        `Failed to fetch content from URL: ${message}`,
        422,
        "URL_FETCH_FAILED",
        { url },
      );
    }

    const { content, title } = fetchResult;

    if (!content || content.trim().length === 0) {
      throw new Errors.MoleculerClientError(
        "The URL returned no text content",
        422,
        "EMPTY_CONTENT",
        { url },
      );
    }

    // Compute hash from URL + content for duplicate detection
    const contentHash = crypto
      .createHash("sha256")
      .update(url + content)
      .digest("hex");

    // Check for duplicates
    const originalFileRepo = dataSource.getRepository(OriginalFile);
    const existing = await originalFileRepo.findOneBy({
      sessionId,
      fileHash: contentHash,
    });

    if (existing) {
      throw new Errors.MoleculerClientError(
        "This URL has already been imported to this session",
        409,
        "DUPLICATE_URL",
        { url, fileHash: contentHash },
      );
    }

    // Create OriginalFile record (no physical file on disk for URLs)
    const originalFile = originalFileRepo.create({
      sessionId,
      filename: title || parsed.hostname,
      mimeType: "text/html",
      fileSize: Buffer.byteLength(content, "utf-8"),
      fileHash: contentHash,
      storagePath: url,
    });
    const savedFile = await originalFileRepo.save(originalFile);

    // Chunk the text content using semantic chunking
    const textChunks = await semanticChunkText(content, {
      chunkSize: 1500,
      overlap: 100,
    });

    // Create the dataset
    const datasetRepo = dataSource.getRepository(Dataset);
    const datasetName = title
      ? `${title} — Web Import`
      : `${parsed.hostname} — Web Import`;

    const dataset = datasetRepo.create({
      sessionId,
      originalFileId: savedFile.id,
      name: datasetName,
      fileType: FileType.URL,
      datasetType: DatasetType.UNSTRUCTURED_TEXT,
      metadataStatus: MetadataStatus.PENDING,
      rowCount: textChunks.length,
      columnCount: null,
      columnMappings: null,
      sheetName: null,
      tablePosition: null,
      sourceFileHash: contentHash,
      importedAt: new Date(),
    });
    const savedDataset = await datasetRepo.save(dataset);

    // Insert text chunks in batches
    const textChunkRepo = dataSource.getRepository(TextChunk);
    const chunkBatchSize = 500;
    for (let i = 0; i < textChunks.length; i += chunkBatchSize) {
      const batch = textChunks.slice(i, i + chunkBatchSize);
      const records = batch.map((chunk, batchIndex) =>
        textChunkRepo.create({
          datasetId: savedDataset.id,
          sessionId,
          content: chunk.content,
          sourcePage: null,
          sourceSection: chunk.sourceSection || null,
          orderIndex: i + batchIndex,
        }),
      );
      await textChunkRepo.save(records);
    }

    const createdDatasets = [
      {
        id: savedDataset.id,
        name: savedDataset.name,
        datasetType: savedDataset.datasetType,
        rowCount: savedDataset.rowCount,
        columnCount: savedDataset.columnCount,
      },
    ];

    // Emit metadata generation event (fire-and-forget)
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
        logger.error("Failed to emit metadata.generateMetadata:", err);
      });

    // Update session dataset count
    try {
      await ctx.broker.call("session.updateSessionStatus", {
        sessionId,
        trigger: "dataset-imported",
        count: 1,
      });
    } catch (err) {
      logger.warn(
        "Failed to update session status (analysis microservice may not be running):",
        err,
      );
    }

    logger.info(
      `URL import complete: ${url} → 1 dataset for session ${sessionId}`,
    );

    return {
      originalFileId: savedFile.id,
      datasets: createdDatasets,
    };
  },
});
