/**
 * Summarize Document Tool
 *
 * Generate an AI summary of a text dataset using map-reduce strategy.
 * Chunks are split into batches, each batch is summarized independently (map),
 * then all batch summaries are combined into a final summary (reduce).
 * The `concurrency` parameter controls how many AI calls run in parallel.
 */

import type { TypedContext } from "core.lib/__generated__";
import type { AIAdapter } from "core.lib/adapters/ai";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { TextChunk } from "../../db/text-chunk.entity";

const BATCH_SIZE = 20;
const MAX_CHARS_PER_BATCH = 12000;

export interface SummarizeDocumentParams {
  /** How many AI calls can run in parallel (1 = sequential) */
  concurrency?: number;
  datasetId: string;
}

/**
 * Split an array into batches of a given size.
 */
function splitIntoBatches<T>(req: { items: T[]; size: number }): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < req.items.length; i += req.size) {
    batches.push(req.items.slice(i, i + req.size));
  }
  return batches;
}

/**
 * Run async tasks with a concurrency limit.
 * When concurrency is 1, tasks run sequentially.
 * When concurrency >= tasks.length, all run in parallel.
 */
async function runWithConcurrency<T>(req: {
  concurrency: number;
  tasks: (() => Promise<T>)[];
}): Promise<T[]> {
  const { concurrency, tasks } = req;

  if (concurrency >= tasks.length) {
    return Promise.all(tasks.map((task) => task()));
  }

  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Summarize a single batch of text content.
 */
async function summarizeBatch(req: {
  ai: AIAdapter;
  batchIndex: number;
  ctx: TypedContext<SummarizeDocumentParams>;
  text: string;
  totalBatches: number;
}): Promise<string> {
  const { ai, batchIndex, ctx, text, totalBatches } = req;
  const logger = ctx.broker.logger;

  const batchContext =
    totalBatches > 1 ? ` (Part ${batchIndex + 1} of ${totalBatches})` : "";

  const truncatedLength = Math.min(text.length, MAX_CHARS_PER_BATCH);
  logger.debug(
    `[summarizeDocument] summarizeBatch ${batchIndex + 1}/${totalBatches} — input: ${text.length} chars, truncated to: ${truncatedLength} chars`,
  );

  const start = Date.now();
  const result = await ai.generateText({
    prompt: `Provide a comprehensive summary of the following document content${batchContext}. Include key points, main themes, and important details.\n\n${text.slice(0, MAX_CHARS_PER_BATCH)}`,
  });

  logger.debug(
    `[summarizeDocument] summarizeBatch ${batchIndex + 1}/${totalBatches} — completed in ${Date.now() - start}ms, output: ${result.content.length} chars`,
  );

  return result.content;
}

/**
 * Reduce multiple summaries into a single cohesive summary.
 * Applies recursively if intermediate summaries are still too numerous.
 */
async function reduceSummaries(req: {
  ai: AIAdapter;
  concurrency: number;
  ctx: TypedContext<SummarizeDocumentParams>;
  summaries: string[];
}): Promise<string> {
  const { ai, concurrency, ctx, summaries } = req;
  const logger = ctx.broker.logger;

  logger.debug(
    `[summarizeDocument] reduceSummaries — ${summaries.length} summaries to reduce, concurrency: ${concurrency}`,
  );

  if (summaries.length === 1) {
    logger.debug(
      "[summarizeDocument] reduceSummaries — single summary, returning as-is",
    );
    return summaries[0];
  }

  const combined = summaries
    .map((s, i) => `--- Part ${i + 1} ---\n${s}`)
    .join("\n\n");

  logger.debug(
    `[summarizeDocument] reduceSummaries — combined length: ${combined.length} chars (limit: ${MAX_CHARS_PER_BATCH})`,
  );

  if (combined.length <= MAX_CHARS_PER_BATCH) {
    const start = Date.now();
    const result = await ai.generateText({
      prompt: `The following are summaries of different parts of a document. Combine them into a single comprehensive summary that captures all key points, main themes, and important details. Remove redundancy and create a cohesive narrative.\n\n${combined}`,
    });
    logger.debug(
      `[summarizeDocument] reduceSummaries — final reduce completed in ${Date.now() - start}ms, output: ${result.content.length} chars`,
    );
    return result.content;
  }

  // Summaries themselves are too long — batch and recursively reduce
  const summaryBatches = splitIntoBatches({
    items: summaries,
    size: BATCH_SIZE,
  });

  logger.info(
    `[summarizeDocument] reduceSummaries — combined too long, splitting into ${summaryBatches.length} sub-batches for recursive reduce`,
  );

  const tasks = summaryBatches.map((batch, index) => () => {
    const batchText = batch
      .map((s, i) => `--- Part ${i + 1} ---\n${s}`)
      .join("\n\n");
    return summarizeBatch({
      ai,
      batchIndex: index,
      ctx,
      text: batchText,
      totalBatches: summaryBatches.length,
    });
  });

  const reducedSummaries = await runWithConcurrency({ concurrency, tasks });
  logger.debug(
    `[summarizeDocument] reduceSummaries — recursive reduce: ${summaries.length} → ${reducedSummaries.length} summaries`,
  );
  return reduceSummaries({
    ai,
    concurrency,
    ctx,
    summaries: reducedSummaries,
  });
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
    logger.debug("[summarizeDocument] dataset validated");

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
    if (chunks.length <= BATCH_SIZE) {
      const combinedText = chunks.map((c) => c.content).join("\n\n");
      logger.info(
        `[summarizeDocument] single-batch fast path — ${chunks.length} chunks, ${combinedText.length} chars`,
      );

      const summary = await summarizeBatch({
        ai,
        batchIndex: 0,
        ctx,
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
    const chunkBatches = splitIntoBatches({ items: chunks, size: BATCH_SIZE });

    logger.info(
      `[summarizeDocument] map phase — ${chunkBatches.length} batches (batch size: ${BATCH_SIZE}), concurrency: ${concurrency}`,
    );

    const mapTasks = chunkBatches.map((batch, index) => () => {
      const batchText = batch.map((c) => c.content).join("\n\n");
      logger.debug(
        `[summarizeDocument] map batch ${index + 1}/${chunkBatches.length} — ${batch.length} chunks, ${batchText.length} chars`,
      );
      return summarizeBatch({
        ai,
        batchIndex: index,
        ctx,
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
    const summary = await reduceSummaries({
      ai,
      concurrency,
      ctx,
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
