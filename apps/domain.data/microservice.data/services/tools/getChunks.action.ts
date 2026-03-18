/**
 * Get Chunks Tool
 *
 * Retrieve text chunks from an unstructured dataset by order index range.
 * Enables the AI to "read" specific parts of a document referenced by the document index.
 */

import { type AuthenticatedContext, defineAction } from "core.lib/broker";
import { Between, type FindOperator } from "typeorm";
import { dataSource } from "../../db";
import { TextChunk } from "../../db/text-chunk.entity";

export interface GetChunksParams {
  datasetId: string;
  startIndex?: number;
  endIndex?: number;
  limit?: number;
}

export default defineAction<GetChunksParams, unknown>({
  authentication: true,
  params: {
    datasetId: { type: "uuid" },
    startIndex: {
      type: "number",
      integer: true,
      min: 0,
      optional: true,
      default: 0,
    },
    endIndex: {
      type: "number",
      integer: true,
      min: 0,
      optional: true,
    },
    limit: {
      type: "number",
      integer: true,
      min: 1,
      max: 50,
      optional: true,
      default: 20,
    },
  },

  async handler(ctx: AuthenticatedContext<GetChunksParams>) {
    const { datasetId, startIndex = 0, endIndex, limit = 20 } = ctx.params;

    await ctx.call("dataset.getDataset", { id: datasetId });

    const chunkRepo = dataSource.getRepository(TextChunk);

    // Count total chunks for context
    const totalChunks = await chunkRepo.count({
      where: { datasetId },
    });

    if (totalChunks === 0) {
      return {
        chunks: [],
        totalChunks: 0,
        message: "No text content found for this dataset.",
      };
    }

    // Build query conditions
    const where: {
      datasetId: string;
      orderIndex?: FindOperator<number>;
    } = { datasetId };

    const effectiveLimit = endIndex != null ? endIndex - startIndex + 1 : limit;
    const take = Math.min(effectiveLimit, 50);

    if (endIndex != null) {
      where.orderIndex = Between(startIndex, endIndex);
    }

    const chunks = await chunkRepo.find({
      where,
      order: { orderIndex: "ASC" },
      skip: endIndex != null ? 0 : startIndex,
      take,
    });

    return {
      chunks: chunks.map((c) => ({
        orderIndex: c.orderIndex,
        content: c.content,
        sourcePage: c.sourcePage,
        sourceSection: c.sourceSection,
      })),
      totalChunks,
      startIndex: chunks.length > 0 ? chunks[0].orderIndex : startIndex,
      endIndex:
        chunks.length > 0 ? chunks[chunks.length - 1].orderIndex : startIndex,
      count: chunks.length,
    };
  },
});
