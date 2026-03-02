/**
 * Summarize Document Tool
 *
 * Generate an AI summary of a text dataset by combining its chunks.
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { TextChunk } from "../../db/text-chunk.entity";

export interface SummarizeDocumentParams {
  datasetId: string;
  maxChunks?: number;
}

export default defineAction<SummarizeDocumentParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    maxChunks: {
      type: "number",
      integer: true,
      min: 1,
      max: 50,
      optional: true,
      default: 20,
    },
  },

  async handler(ctx: TypedContext<SummarizeDocumentParams>) {
    const { datasetId, maxChunks = 20 } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const chunkRepo = dataSource.getRepository(TextChunk);

    const chunks = await chunkRepo.find({
      where: { datasetId },
      order: { orderIndex: "ASC" },
      take: maxChunks,
    });

    if (chunks.length === 0) {
      return { summary: "No text content found for this dataset.", chunks: 0 };
    }

    const combinedText = chunks.map((c) => c.content).join("\n\n");

    const ai = createAIAdapter();
    const summary = await ai.generateText({
      prompt: `Provide a comprehensive summary of the following document content. Include key points, main themes, and important details.\n\n${combinedText.slice(0, 12000)}`,
    });

    return {
      summary: summary.content,
      chunksUsed: chunks.length,
      totalLength: combinedText.length,
    };
  },
});
