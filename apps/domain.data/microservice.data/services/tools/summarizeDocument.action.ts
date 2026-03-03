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
  text: string;
  totalBatches: number;
}): Promise<string> {
  const { ai, batchIndex, text, totalBatches } = req;

  const batchContext =
    totalBatches > 1 ? ` (Part ${batchIndex + 1} of ${totalBatches})` : "";

  const result = await ai.generateText({
    prompt: `Provide a comprehensive summary of the following document content${batchContext}. Include key points, main themes, and important details.\n\n${text.slice(0, MAX_CHARS_PER_BATCH)}`,
  });

  return result.content;
}

/**
 * Reduce multiple summaries into a single cohesive summary.
 * Applies recursively if intermediate summaries are still too numerous.
 */
async function reduceSummaries(req: {
  ai: AIAdapter;
  concurrency: number;
  summaries: string[];
}): Promise<string> {
  const { ai, concurrency, summaries } = req;

  if (summaries.length === 1) {
    return summaries[0];
  }

  const combined = summaries
    .map((s, i) => `--- Part ${i + 1} ---\n${s}`)
    .join("\n\n");

  if (combined.length <= MAX_CHARS_PER_BATCH) {
    const result = await ai.generateText({
      prompt: `The following are summaries of different parts of a document. Combine them into a single comprehensive summary that captures all key points, main themes, and important details. Remove redundancy and create a cohesive narrative.\n\n${combined}`,
    });
    return result.content;
  }

  // Summaries themselves are too long — batch and recursively reduce
  const summaryBatches = splitIntoBatches({
    items: summaries,
    size: BATCH_SIZE,
  });

  const tasks = summaryBatches.map((batch, index) => () => {
    const batchText = batch
      .map((s, i) => `--- Part ${i + 1} ---\n${s}`)
      .join("\n\n");
    return summarizeBatch({
      ai,
      batchIndex: index,
      text: batchText,
      totalBatches: summaryBatches.length,
    });
  });

  const reducedSummaries = await runWithConcurrency({ concurrency, tasks });
  return reduceSummaries({ ai, concurrency, summaries: reducedSummaries });
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
    await ctx.call("dataset.getDataset", { id: datasetId });
    const chunkRepo = dataSource.getRepository(TextChunk);

    const chunks = await chunkRepo.find({
      where: { datasetId },
      order: { orderIndex: "ASC" },
    });

    if (chunks.length === 0) {
      return { chunks: 0, summary: "No text content found for this dataset." };
    }

    const ai = createAIAdapter();

    // Single-batch fast path: no map-reduce needed
    if (chunks.length <= BATCH_SIZE) {
      const combinedText = chunks.map((c) => c.content).join("\n\n");
      const summary = await summarizeBatch({
        ai,
        batchIndex: 0,
        text: combinedText,
        totalBatches: 1,
      });

      return {
        batchesUsed: 1,
        chunksUsed: chunks.length,
        summary,
        totalLength: combinedText.length,
      };
    }

    // Map phase: split chunks into batches, summarize each
    const chunkBatches = splitIntoBatches({ items: chunks, size: BATCH_SIZE });

    const mapTasks = chunkBatches.map((batch, index) => () => {
      const batchText = batch.map((c) => c.content).join("\n\n");
      return summarizeBatch({
        ai,
        batchIndex: index,
        text: batchText,
        totalBatches: chunkBatches.length,
      });
    });

    const batchSummaries = await runWithConcurrency({
      concurrency,
      tasks: mapTasks,
    });

    // Reduce phase: combine batch summaries into final summary
    const summary = await reduceSummaries({
      ai,
      concurrency,
      summaries: batchSummaries,
    });

    const totalLength = chunks.reduce((acc, c) => acc + c.content.length, 0);

    return {
      batchesUsed: chunkBatches.length,
      chunksUsed: chunks.length,
      summary,
      totalLength,
    };
  },
});
