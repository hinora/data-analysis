/**
 * Upload Files Action
 *
 * Handles multi-file upload for a session in a single request:
 * 1. Receives all files from the gateway function alias
 * 2. Processes each file sequentially (validate, hash, save, parse)
 * 3. Emits ONE metadata.generateMetadata event with ALL datasets
 * 4. Updates session datasetCount once via cross-service call
 *
 * This ensures metadata generation runs sequentially across all files,
 * avoiding parallel AI calls that would stress the model.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { type ProcessFileResult, processUploadedFile } from "./processFile";

interface FileEntry {
  data: Buffer;
  filename: string;
  mimetype: string;
}

export interface UploadFilesParams {
  files: FileEntry[];
  sessionId: string;
}

export interface UploadFilesResult {
  files: Array<{
    datasets: ProcessFileResult["datasets"];
    filename: string;
    originalFileId: string;
  }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default defineAction<UploadFilesParams, UploadFilesResult>({
  // Internal action — called from the gateway function alias, not via REST
  async handler(ctx: TypedContext<UploadFilesParams>) {
    const { files, sessionId } = ctx.params;

    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      throw new Errors.MoleculerClientError(
        "Invalid or missing sessionId",
        400,
        "INVALID_SESSION_ID",
        { sessionId },
      );
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new Errors.MoleculerClientError(
        "No files provided",
        400,
        "NO_FILES",
      );
    }

    const fileResults: UploadFilesResult["files"] = [];
    const allDatasets: Array<{
      datasetId: string;
      datasetType: string;
      name: string;
    }> = [];

    // Process each file sequentially
    for (const file of files) {
      const result = await processUploadedFile({
        fileBuffer: Buffer.isBuffer(file.data)
          ? file.data
          : Buffer.from(file.data),
        filename: file.filename,
        logger: ctx.broker.logger,
        mimetype: file.mimetype,
        sessionId,
      });

      fileResults.push({
        datasets: result.datasets,
        filename: file.filename,
        originalFileId: result.originalFileId,
      });

      for (const d of result.datasets) {
        allDatasets.push({
          datasetId: d.id,
          datasetType: d.datasetType,
          name: d.name,
        });
      }
    }

    // Emit ONE metadata.generateMetadata event with ALL datasets from all files.
    // The handler processes them sequentially (one by one) to limit Ollama load.
    if (allDatasets.length > 0) {
      ctx
        .emit("metadata.generateMetadata", {
          datasets: allDatasets,
          sessionId,
        })
        .catch((err: unknown) => {
          ctx.broker.logger.error(
            "Failed to emit metadata.generateMetadata:",
            err,
          );
        });
    }

    // Update session dataset count via cross-service call (once for all files).
    if (allDatasets.length > 0) {
      try {
        await ctx.broker.call("session.updateSessionStatus", {
          count: allDatasets.length,
          sessionId,
          trigger: "dataset-imported",
        });
      } catch (err) {
        ctx.broker.logger.warn(
          "Failed to update session status (analysis microservice may not be running):",
          err,
        );
      }
    }

    ctx.broker.logger.info(
      `Multi-file upload complete: ${files.length} file(s) → ${allDatasets.length} dataset(s) for session ${sessionId}`,
    );

    return { files: fileResults };
  },
});
