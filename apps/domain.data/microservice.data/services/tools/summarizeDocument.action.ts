/**
 * Summarize Document Tool
 *
 * Generate an AI summary of a text dataset using map-reduce strategy.
 * Chunks are split into batches, each batch is summarized independently (map),
 * then all batch summaries are combined into a final summary (reduce).
 * The `concurrency` parameter controls how many AI calls run in parallel.
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { TextChunk } from "../../db/text-chunk.entity";
import {
  MAX_CHARS_PER_BATCH,
  reduceTextSummaries,
  runWithConcurrency,
  splitIntoBatchesByChars,
  summarizeTextBatch,
} from "../../lib/map-reduce";

export interface SummarizeDocumentParams {
  /** How many AI calls can run in parallel (1 = sequential) */
  concurrency?: number;
  datasetId: string;
}

export default defineAction<SummarizeDocumentParams, unknown>({
  params: {
    concurrency: {
      default: 1,
      integer: true,
      max: 10,
      min: 1,
      optional: true,
      type: "number",
    },
    datasetId: { type: "uuid" },
  },

  async handler(ctx: TypedContext<SummarizeDocumentParams>) {
    const { concurrency = 1, datasetId } = ctx.params;
    const handlerStart = Date.now();
    const logger = ctx.broker.logger;

    logger.info(
      `[summarizeDocument] START — datasetId: ${datasetId}, concurrency: ${concurrency}`,
    );

    await ctx.call("dataset.getDataset", { id: datasetId });
    logger.info("[summarizeDocument] dataset validated");

    const chunkRepo = dataSource.getRepository(TextChunk);

    const chunks = await chunkRepo.find({
      where: { datasetId },
      order: { orderIndex: "ASC" },
    });

    logger.info(
      `[summarizeDocument] loaded ${chunks.length} chunks from database`,
    );

    if (chunks.length === 0) {
      logger.warn(
        "[summarizeDocument] no chunks found — returning empty summary",
      );
      return { chunks: 0, summary: "No text content found for this dataset." };
    }

    const ai = createAIAdapter();

    // Single-batch fast path: no map-reduce needed
    const combinedText = chunks.map((c) => c.content).join("\n\n");
    if (combinedText.length <= MAX_CHARS_PER_BATCH) {
      logger.info(
        `[summarizeDocument] single-batch fast path — ${chunks.length} chunks, ${combinedText.length} chars`,
      );

      const summary = await summarizeTextBatch({
        ai,
        batchIndex: 0,
        logger,
        text: combinedText,
        totalBatches: 1,
      });

      logger.info(
        `[summarizeDocument] DONE (single-batch) — ${Date.now() - handlerStart}ms total`,
      );

      return {
        batchesUsed: 1,
        chunksUsed: chunks.length,
        summary,
        totalLength: combinedText.length,
      };
    }

    // Map phase: split chunks into batches, summarize each
    const chunkBatches = splitIntoBatchesByChars({
      getLength: (chunk) => chunk.content.length,
      items: chunks,
      maxChars: MAX_CHARS_PER_BATCH,
    });

    logger.info(
      `[summarizeDocument] map phase — ${chunkBatches.length} batches (max ${MAX_CHARS_PER_BATCH} chars/batch), concurrency: ${concurrency}`,
    );

    const mapTasks = chunkBatches.map((batch, index) => () => {
      const batchText = batch.map((c) => c.content).join("\n\n");
      logger.info(
        `[summarizeDocument] map batch ${index + 1}/${chunkBatches.length} — ${batch.length} chunks, ${batchText.length} chars`,
      );
      return summarizeTextBatch({
        ai,
        batchIndex: index,
        logger,
        text: batchText,
        totalBatches: chunkBatches.length,
      });
    });

    const mapStart = Date.now();
    const batchSummaries = await runWithConcurrency({
      concurrency,
      tasks: mapTasks,
    });

    logger.info(
      `[summarizeDocument] map phase complete — ${batchSummaries.length} summaries in ${Date.now() - mapStart}ms`,
    );

    // Reduce phase: combine batch summaries into final summary
    logger.info("[summarizeDocument] reduce phase — combining batch summaries");
    const reduceStart = Date.now();
    const summary = await reduceTextSummaries({
      ai,
      concurrency,
      logger,
      summaries: batchSummaries,
    });

    logger.info(
      `[summarizeDocument] reduce phase complete — ${Date.now() - reduceStart}ms`,
    );

    const totalLength = chunks.reduce((acc, c) => acc + c.content.length, 0);

    logger.info(
      `[summarizeDocument] DONE — ${chunks.length} chunks, ${chunkBatches.length} batches, ${totalLength} chars total, ${Date.now() - handlerStart}ms elapsed`,
    );

    return {
      batchesUsed: chunkBatches.length,
      chunksUsed: chunks.length,
      summary,
      totalLength,
    };
  },
});
