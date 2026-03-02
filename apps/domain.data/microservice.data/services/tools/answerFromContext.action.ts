/**
 * Answer From Context Tool
 *
 * Answer a question using retrieved text context via vector search (RAG pattern).
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";

export interface AnswerFromContextParams {
  sessionId: string;
  question: string;
  topK?: number;
  datasetId?: string;
}

export default defineAction<AnswerFromContextParams, unknown>({
  params: {
    sessionId: { type: "uuid" },
    question: { type: "string", min: 1 },
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

  async handler(ctx: TypedContext<AnswerFromContextParams>) {
    const { sessionId, question, topK = 5, datasetId } = ctx.params;

    // Validate session exists
    await ctx.call("session.getSession", { id: sessionId });
    // Validate dataset exists if provided
    if (datasetId) {
      await ctx.call("dataset.getDataset", { id: datasetId });
    }

    // Generate embedding for the question
    const ai = createAIAdapter();
    const embeddingResult = await ai.generateEmbeddings({
      input: [question],
    });

    const queryEmbedding = embeddingResult.embeddings[0];
    if (!queryEmbedding) {
      return { answer: "Unable to process query embedding.", sources: [] };
    }

    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Retrieve relevant chunks via vector search
    let sql = `
      SELECT
        tc.content,
        tc."sourcePage",
        tc."sourceSection",
        d.name AS "datasetName",
        tc.embedding::vector <=> $1::vector AS distance
      FROM "textChunks" tc
      JOIN "datasets" d ON d.id = tc."datasetId"
      WHERE tc."sessionId" = $2
        AND tc.embedding IS NOT NULL
    `;
    const params: unknown[] = [embeddingStr, sessionId];

    if (datasetId) {
      sql += ` AND tc."datasetId" = $3`;
      params.push(datasetId);
    }

    sql += ` ORDER BY tc.embedding::vector <=> $1::vector LIMIT ${topK}`;

    const chunks = await dataSource.query(sql, params);

    if (chunks.length === 0) {
      return {
        answer: "No relevant context found to answer this question.",
        sources: [],
      };
    }

    // Build context for the AI
    const context = chunks
      .map(
        (c: Record<string, unknown>, i: number) =>
          `[Source ${i + 1} - ${c.datasetName}${c.sourcePage ? `, page ${c.sourcePage}` : ""}]\n${c.content}`,
      )
      .join("\n\n");

    // Generate answer using the context
    const answer = await ai.generateText({
      prompt: `Answer the following question based ONLY on the provided context. If the context doesn't contain enough information to answer, say so clearly. Cite your sources using [Source N] notation.

Question: ${question}

Context:
${context}`,
    });

    return {
      answer: answer.content,
      sources: chunks.map((c: Record<string, unknown>, i: number) => ({
        sourceIndex: i + 1,
        datasetName: c.datasetName,
        sourcePage: c.sourcePage,
        sourceSection: c.sourceSection,
        similarity: c.distance != null ? 1 - Number(c.distance) : null,
        excerpt: String(c.content).slice(0, 200),
      })),
    };
  },
});
