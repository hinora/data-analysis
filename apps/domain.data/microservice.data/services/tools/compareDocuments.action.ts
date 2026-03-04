/**
 * Compare Documents Tool
 *
 * Compare two text datasets for similarities and differences.
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { Dataset } from "../../db/dataset.entity";
import { TextChunk } from "../../db/text-chunk.entity";
import {
  reduceTextSummaries,
  runWithConcurrency,
  splitIntoBatchesByChars,
  summarizeTextBatch,
} from "../../lib/map-reduce";
import { scanTextChunkPages } from "../../lib/text-chunk-pagination";

export interface CompareDocumentsParams {
  datasetId1: string;
  datasetId2: string;
  summaryConcurrency?: number;
}

export default defineAction<CompareDocumentsParams, unknown>({
  params: {
    datasetId1: { type: "uuid" },
    datasetId2: { type: "uuid" },
    summaryConcurrency: {
      default: 1,
      integer: true,
      max: 10,
      min: 1,
      optional: true,
      type: "number",
    },
  },

  async handler(ctx: TypedContext<CompareDocumentsParams>) {
    const { datasetId1, datasetId2, summaryConcurrency = 1 } = ctx.params;
    const logger = ctx.broker.logger;

    // Validate both datasets exist
    await Promise.all([
      ctx.call("dataset.getDataset", { id: datasetId1 }),
      ctx.call("dataset.getDataset", { id: datasetId2 }),
    ]);

    const chunkRepo = dataSource.getRepository(TextChunk);
    const datasetRepo = dataSource.getRepository(Dataset);

    // Get dataset info
    const [dataset1, dataset2] = await Promise.all([
      datasetRepo.findOneBy({ id: datasetId1 }),
      datasetRepo.findOneBy({ id: datasetId2 }),
    ]);

    const ai = createAIAdapter();

    const summarizeDataset = async (req: {
      datasetId: string;
      label: string;
    }): Promise<{ chunkCount: number; summary: string }> => {
      const { datasetId, label } = req;
      const batchSummaries: string[] = [];

      const { totalChunks } = await scanTextChunkPages({
        chunkRepo,
        datasetId,
        onPage: async ({ chunks, page, totalChunks }) => {
          const chunkBatches = splitIntoBatchesByChars({
            getLength: (chunk) => chunk.content.length,
            items: chunks,
            maxChars: 12_000,
          });

          const tasks = chunkBatches.map((batch, index) => () => {
            const batchText = batch.map((chunk) => chunk.content).join("\n\n");
            return summarizeTextBatch({
              ai,
              batchIndex: index,
              logger,
              text: batchText,
              totalBatches: chunkBatches.length,
            });
          });

          const pageSummaries = await runWithConcurrency({
            concurrency: summaryConcurrency,
            tasks,
          });

          logger.info(
            `[compareDocuments] ${label}: processed page ${page + 1}, ${chunks.length} chunks, ${batchSummaries.length + pageSummaries.length} batch summaries so far (total chunks: ${totalChunks})`,
          );

          batchSummaries.push(...pageSummaries);
        },
      });

      if (totalChunks === 0 || batchSummaries.length === 0) {
        return { chunkCount: totalChunks, summary: "" };
      }

      const summary =
        batchSummaries.length === 1
          ? batchSummaries[0]
          : await reduceTextSummaries({
              ai,
              concurrency: summaryConcurrency,
              logger,
              summaries: batchSummaries,
            });

      return {
        chunkCount: totalChunks,
        summary,
      };
    };

    const [summary1, summary2] = await Promise.all([
      summarizeDataset({
        datasetId: datasetId1,
        label: dataset1?.name || datasetId1,
      }),
      summarizeDataset({
        datasetId: datasetId2,
        label: dataset2?.name || datasetId2,
      }),
    ]);

    if (!summary1.summary || !summary2.summary) {
      return {
        comparison: "One or both documents have no text content.",
        similarities: [],
        differences: [],
      };
    }

    const result = await ai.generateJSON({
      prompt: `Compare the following two documents. Identify similarities, differences, and provide an overall comparison.

Document 1 (${dataset1?.name || "Unknown"}):
${summary1.summary}

Document 2 (${dataset2?.name || "Unknown"}):
${summary2.summary}

Return JSON format: {
  "summary": string,
  "similarities": [string],
  "differences": [string],
  "overlapScore": number (0-1)
}`,
      schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          similarities: { type: "array", items: { type: "string" } },
          differences: { type: "array", items: { type: "string" } },
          overlapScore: { type: "number" },
        },
      },
    });

    const parsed =
      result.data && typeof result.data === "object"
        ? (result.data as Record<string, unknown>)
        : {};
    return {
      chunksUsed1: summary1.chunkCount,
      chunksUsed2: summary2.chunkCount,
      document1: dataset1?.name || datasetId1,
      document2: dataset2?.name || datasetId2,
      ...parsed,
    };
  },
});
