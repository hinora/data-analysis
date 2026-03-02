/**
 * Find Similar Chunks Tool
 *
 * Find text chunks similar to a given chunk using vector embeddings.
 */

import type { TypedContext } from "core.lib/__generated__";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";

export interface FindSimilarChunksParams {
  chunkId: string;
  topK?: number;
  sessionId?: string;
}

export default defineAction<FindSimilarChunksParams, unknown>({
  params: {
    chunkId: { type: "uuid" },
    topK: {
      type: "number",
      integer: true,
      min: 1,
      max: 20,
      optional: true,
      default: 5,
    },
    sessionId: { type: "uuid", optional: true },
  },

  async handler(ctx: TypedContext<FindSimilarChunksParams>) {
    const { chunkId, topK = 5, sessionId } = ctx.params;

    // Get the source chunk embedding
    const sourceChunk = await dataSource.query(
      `SELECT id, embedding, "sessionId", content FROM text_chunk WHERE id = $1`,
      [chunkId],
    );

    if (!sourceChunk[0]?.embedding) {
      return {
        results: [],
        message: "Source chunk not found or has no embedding.",
      };
    }

    const scope = sessionId || sourceChunk[0].sessionId;

    const results = await dataSource.query(
      `
      SELECT
        tc.id,
        tc."datasetId",
        tc.content,
        tc."sourcePage",
        tc."sourceSection",
        tc.embedding <=> (SELECT embedding FROM text_chunk WHERE id = $1) AS distance,
        d.name AS "datasetName"
      FROM text_chunk tc
      JOIN dataset d ON d.id = tc."datasetId"
      WHERE tc."sessionId" = $2
        AND tc.id != $1
        AND tc.embedding IS NOT NULL
      ORDER BY tc.embedding <=> (SELECT embedding FROM text_chunk WHERE id = $1)
      LIMIT $3
      `,
      [chunkId, scope, topK],
    );

    return {
      sourceChunkId: chunkId,
      results: results.map((r: Record<string, unknown>) => ({
        chunkId: r.id,
        datasetId: r.datasetId,
        datasetName: r.datasetName,
        content: r.content,
        sourcePage: r.sourcePage,
        sourceSection: r.sourceSection,
        similarity: r.distance != null ? 1 - Number(r.distance) : null,
      })),
      count: results.length,
    };
  },
});
