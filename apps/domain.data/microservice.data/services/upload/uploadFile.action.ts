/**
 * Upload File Action
 *
 * Handles single-file upload for a session via multipart form data:
 * 1. Extracts file data from multipart metadata
 * 2. Delegates to processUploadedFile for validation, parsing, and storage
 * 3. Emits metadata.generateMetadata event for AI metadata generation
 * 4. Updates session datasetCount via cross-service call
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { processUploadedFile } from "./processFile";

export interface UploadFileParams {
  sessionId: string;
}

export interface UploadFileResult {
  datasets: Array<{
    columnCount: number | null;
    datasetType: string;
    id: string;
    name: string;
    rowCount: number;
  }>;
  originalFileId: string;
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

    // Read the file data from the stream or buffer
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

    // Process the file using shared logic
    const result = await processUploadedFile({
      fileBuffer,
      filename,
      logger: ctx.broker.logger,
      mimetype,
      sessionId,
    });

    // Emit a single metadata.generateMetadata event with all datasets.
    // The handler processes them sequentially (one by one) to limit Ollama load.
    // Do NOT await — ctx.emit() waits for local handlers to complete.
    ctx
      .emit("metadata.generateMetadata", {
        datasets: result.datasets.map((d) => ({
          datasetId: d.id,
          datasetType: d.datasetType,
          name: d.name,
        })),
        sessionId,
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
        count: result.datasets.length,
        sessionId,
        trigger: "dataset-imported",
      });
    } catch (err) {
      ctx.broker.logger.warn(
        "Failed to update session status (analysis microservice may not be running):",
        err,
      );
    }

    ctx.broker.logger.info(
      `Upload complete: ${filename} → ${result.datasets.length} dataset(s) for session ${sessionId}`,
    );

    return result;
  },
});
