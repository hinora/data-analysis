/**
 * Semantic Search Tool
 *
 * Search text chunks by semantic similarity using vector embeddings (pgvector).
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";

export interface SemanticSearchParams {
  sessionId: string;
  query: string;
  topK?: number;
  datasetId?: string;
}

export default defineAction<SemanticSearchParams, unknown>({
  params: {
    sessionId: { type: "uuid" },
    query: { type: "string", min: 1 },
    topK: {
      type: "number",
      integer: true,
      min: 1,
      max: 20,
      optional: true,
      default: 5,
    },
    datasetId: { type: "uuid", optional: true },
  },

  async handler(ctx: TypedContext<SemanticSearchParams>) {
    const { sessionId, query, topK = 5, datasetId } = ctx.params;

    // Generate embedding for the query
    const ai = createAIAdapter();
    const embeddingResult = await ai.generateEmbeddings({
      input: [query],
    });

    const queryEmbedding = embeddingResult.embeddings[0];
    if (!queryEmbedding) {
      return { results: [], message: "Failed to generate query embedding" };
    }

    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Search using cosine distance with pgvector
    let sql = `
      SELECT
        tc.id,
        tc."datasetId",
        tc.content,
        tc."sourcePage",
        tc."sourceSection",
        tc."orderIndex",
        tc.embedding <=> $1::vector AS distance,
        d.name AS "datasetName"
      FROM text_chunk tc
      JOIN dataset d ON d.id = tc."datasetId"
      WHERE tc."sessionId" = $2
        AND tc.embedding IS NOT NULL
    `;

    const params: unknown[] = [embeddingStr, sessionId];

    if (datasetId) {
      sql += ` AND tc."datasetId" = $3`;
      params.push(datasetId);
    }

    sql += `
      ORDER BY tc.embedding <=> $1::vector
      LIMIT ${topK}
    `;

    const results = await dataSource.query(sql, params);

    return {
      query,
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
