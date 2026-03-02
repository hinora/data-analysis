/**
 * Semantic Search Tool
 *
 * Search text chunks by semantic similarity using vector embeddings (pgvector).
 * Requires at least one of sessionId or datasetId (or both).
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";

export interface SemanticSearchParams {
  datasetId?: string;
  query: string;
  sessionId?: string;
  topK?: number;
}

export default defineAction<SemanticSearchParams, unknown>({
  params: {
    datasetId: { type: "uuid", optional: true },
    query: { type: "string", min: 1 },
    sessionId: { type: "uuid", optional: true },
    topK: {
      type: "number",
      integer: true,
      min: 1,
      max: 20,
      optional: true,
      default: 5,
    },
  },

  async handler(ctx: TypedContext<SemanticSearchParams>) {
    const { sessionId, query, topK = 5, datasetId } = ctx.params;

    // Require at least one of sessionId or datasetId
    if (!sessionId && !datasetId) {
      throw new Errors.MoleculerClientError(
        "At least one of sessionId or datasetId must be provided",
        422,
        "VALIDATION_ERROR",
        { fields: ["sessionId", "datasetId"] },
      );
    }

    // Validate session exists if provided
    if (sessionId) {
      await ctx.call("session.getSession", { id: sessionId });
    }
    // Validate dataset exists if provided
    if (datasetId) {
      await ctx.call("dataset.getDataset", { id: datasetId });
    }

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
        tc.embedding::vector <=> $1::vector AS distance,
        d.name AS "datasetName"
      FROM "textChunks" tc
      JOIN "datasets" d ON d.id = tc."datasetId"
      WHERE tc.embedding IS NOT NULL
    `;

    const params: unknown[] = [embeddingStr];
    let paramIndex = 2;

    if (sessionId) {
      sql += ` AND tc."sessionId" = $${paramIndex}`;
      params.push(sessionId);
      paramIndex++;
    }

    if (datasetId) {
      sql += ` AND tc."datasetId" = $${paramIndex}`;
      params.push(datasetId);
      paramIndex++;
    }

    sql += `
      ORDER BY tc.embedding::vector <=> $1::vector
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
