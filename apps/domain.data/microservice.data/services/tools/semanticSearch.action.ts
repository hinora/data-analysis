/**
 * Semantic Search Tool
 *
 * Hybrid search combining vector similarity (pgvector) with keyword matching.
 * Vector search captures semantic meaning; keyword search ensures exact matches
 * (e.g. proper nouns, names) are not missed.
 *
 * Requires at least one of sessionId or datasetId (or both).
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { Errors } from "moleculer";
import { dataSource } from "../../db";

/** Weight for vector similarity score in combined ranking (0–1). */
const VECTOR_WEIGHT = 0.7;

/** Weight for keyword match score in combined ranking (0–1). */
const KEYWORD_WEIGHT = 0.3;

/** Escape ILIKE special characters so the query is treated as a literal. */
function escapeILike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

export interface SemanticSearchParams {
  datasetId?: string;
  query: string;
  sessionId?: string;
  topK?: number;
}

interface RawRow {
  content: string;
  datasetId: string;
  datasetName: string;
  distance: string | number | null;
  id: string;
  orderIndex: number;
  sourcePage: number | null;
  sourceSection: string | null;
  summary: string | null;
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
      return { count: 0, query, results: [] };
    }

    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // ── Build shared filter clause ──────────────────────────────────
    const filterFragments: string[] = [];
    const sharedParams: unknown[] = [];

    if (sessionId) {
      filterFragments.push(`tc."sessionId" = $PLACEHOLDER`);
      sharedParams.push(sessionId);
    }
    if (datasetId) {
      filterFragments.push(`tc."datasetId" = $PLACEHOLDER`);
      sharedParams.push(datasetId);
    }

    // ── Vector similarity query ─────────────────────────────────────
    // Uses pgvector cosine distance; fetches extra rows so keyword-only
    // matches can still fit into the final topK.
    const vectorLimit = topK * 2;
    let vectorParamIdx = 2;
    let vectorFilterSql = "";
    const vectorParams: unknown[] = [embeddingStr];

    for (let i = 0; i < filterFragments.length; i++) {
      vectorFilterSql += ` AND ${filterFragments[i].replace("$PLACEHOLDER", `$${vectorParamIdx}`)}`;
      vectorParams.push(sharedParams[i]);
      vectorParamIdx++;
    }

    const vectorSql = `
      SELECT
        tc.id,
        tc."datasetId",
        tc.content,
        tc."sourcePage",
        tc."sourceSection",
        tc."orderIndex",
        tc.summary,
        tc.embedding <=> $1::vector AS distance,
        d.name AS "datasetName"
      FROM "textChunks" tc
      JOIN "datasets" d ON d.id = tc."datasetId"
      WHERE tc.embedding IS NOT NULL${vectorFilterSql}
      ORDER BY tc.embedding <=> $1::vector
      LIMIT ${vectorLimit}
    `;

    // ── Keyword (ILIKE) query ───────────────────────────────────────
    // Catches exact substring matches the vector model might rank low
    // (e.g. proper nouns, short queries, transliterated names).
    const escapedQuery = escapeILike(query);
    let kwParamIdx = 2;
    let kwFilterSql = "";
    const kwParams: unknown[] = [embeddingStr]; // $1 = embedding (to compute distance)

    // $2 = ILIKE pattern
    kwParams.push(`%${escapedQuery}%`);
    kwParamIdx = 3;

    for (let i = 0; i < filterFragments.length; i++) {
      kwFilterSql += ` AND ${filterFragments[i].replace("$PLACEHOLDER", `$${kwParamIdx}`)}`;
      kwParams.push(sharedParams[i]);
      kwParamIdx++;
    }

    const keywordSql = `
      SELECT
        tc.id,
        tc."datasetId",
        tc.content,
        tc."sourcePage",
        tc."sourceSection",
        tc."orderIndex",
        tc.summary,
        tc.embedding <=> $1::vector AS distance,
        d.name AS "datasetName"
      FROM "textChunks" tc
      JOIN "datasets" d ON d.id = tc."datasetId"
      WHERE tc.embedding IS NOT NULL
        AND tc.content ILIKE $2${kwFilterSql}
      LIMIT ${topK}
    `;

    // ── Execute both queries in parallel ────────────────────────────
    const [vectorResults, keywordResults] = await Promise.all([
      dataSource.query(vectorSql, vectorParams) as Promise<RawRow[]>,
      dataSource.query(keywordSql, kwParams) as Promise<RawRow[]>,
    ]);

    // ── Merge results with combined scoring ─────────────────────────
    const merged = new Map<
      string,
      {
        chunkId: string;
        content: string;
        datasetId: string;
        datasetName: string;
        keywordMatch: boolean;
        similarity: number;
        sourcePage: number | null;
        sourceSection: string | null;
        summary: string | null;
      }
    >();

    // Add vector results
    for (const r of vectorResults) {
      const vectorScore = r.distance != null ? 1 - Number(r.distance) : 0;
      merged.set(r.id, {
        chunkId: r.id,
        content: r.content as string,
        datasetId: r.datasetId as string,
        datasetName: r.datasetName as string,
        keywordMatch: false,
        similarity: vectorScore * VECTOR_WEIGHT,
        sourcePage: r.sourcePage as number | null,
        sourceSection: r.sourceSection as string | null,
        summary: r.summary as string | null,
      });
    }

    // Merge keyword results (boost existing, add missing)
    for (const r of keywordResults) {
      const vectorScore = r.distance != null ? 1 - Number(r.distance) : 0;
      const existing = merged.get(r.id);

      if (existing) {
        // Already from vector search → boost with keyword weight
        existing.keywordMatch = true;
        existing.similarity = vectorScore * VECTOR_WEIGHT + KEYWORD_WEIGHT;
      } else {
        // Keyword-only hit → add with combined score
        merged.set(r.id, {
          chunkId: r.id,
          content: r.content as string,
          datasetId: r.datasetId as string,
          datasetName: r.datasetName as string,
          keywordMatch: true,
          similarity: vectorScore * VECTOR_WEIGHT + KEYWORD_WEIGHT,
          sourcePage: r.sourcePage as number | null,
          sourceSection: r.sourceSection as string | null,
          summary: r.summary as string | null,
        });
      }
    }

    // Sort descending by combined similarity, then take topK
    const results = [...merged.values()]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return {
      count: results.length,
      query,
      results,
    };
  },
});
