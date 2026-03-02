/**
 * Sentiment Analysis Tool
 *
 * Analyze sentiment of text content from a dataset.
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { TextChunk } from "../../db/text-chunk.entity";

export interface SentimentAnalysisParams {
  datasetId: string;
  granularity?: string;
}

export default defineAction<SentimentAnalysisParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    granularity: {
      type: "enum",
      values: ["document", "chunk"],
      optional: true,
      default: "document",
    },
  },

  async handler(ctx: TypedContext<SentimentAnalysisParams>) {
    const { datasetId, granularity = "document" } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const chunkRepo = dataSource.getRepository(TextChunk);

    const chunks = await chunkRepo.find({
      where: { datasetId },
      order: { orderIndex: "ASC" },
      take: 20,
    });

    if (chunks.length === 0) {
      return { sentiment: null, message: "No text content found." };
    }

    const ai = createAIAdapter();

    if (granularity === "chunk") {
      // Analyze each chunk individually
      const chunkResults: Array<{
        chunkIndex: number;
        sentiment: string;
        score: number;
        keyPhrases: string[];
      }> = [];

      for (const chunk of chunks.slice(0, 10)) {
        const result = await ai.generateJSON({
          prompt: `Analyze the sentiment of the following text. Return the overall sentiment (positive, negative, neutral, mixed), a score from -1 (most negative) to 1 (most positive), and key phrases that indicate the sentiment.

Return JSON: { "sentiment": string, "score": number, "keyPhrases": [string] }

Text: ${chunk.content.slice(0, 2000)}`,
          schema: {
            type: "object",
            properties: {
              sentiment: { type: "string" },
              score: { type: "number" },
              keyPhrases: { type: "array", items: { type: "string" } },
            },
          },
        });

        const parsed =
          result.data && typeof result.data === "object"
            ? (result.data as Record<string, unknown>)
            : {};
        chunkResults.push({
          chunkIndex: chunk.orderIndex,
          sentiment: String((parsed as any).sentiment || ""),
          score: Number((parsed as any).score || 0),
          keyPhrases: ((parsed as any).keyPhrases || []) as string[],
        });
      }

      const avgScore =
        chunkResults.reduce((sum, r) => sum + (r.score || 0), 0) /
        chunkResults.length;

      return {
        granularity: "chunk",
        overallScore: avgScore,
        overallSentiment:
          avgScore > 0.2
            ? "positive"
            : avgScore < -0.2
              ? "negative"
              : "neutral",
        chunks: chunkResults,
        chunksAnalyzed: chunkResults.length,
      };
    }

    // Document-level analysis
    const combinedText = chunks.map((c) => c.content).join("\n\n");
    const result = await ai.generateJSON({
      prompt: `Analyze the overall sentiment of the following document. Provide:
- Overall sentiment (positive, negative, neutral, mixed)
- Score from -1 (most negative) to 1 (most positive)
- Key themes and their sentiments
- Notable emotional tones

Return JSON: { "sentiment": string, "score": number, "themes": [{ "theme": string, "sentiment": string, "score": number }], "tones": [string] }

Text:
${combinedText.slice(0, 10000)}`,
      schema: {
        type: "object",
        properties: {
          sentiment: { type: "string" },
          score: { type: "number" },
          themes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                theme: { type: "string" },
                sentiment: { type: "string" },
                score: { type: "number" },
              },
            },
          },
          tones: { type: "array", items: { type: "string" } },
        },
      },
    });

    const parsed =
      result.data && typeof result.data === "object"
        ? (result.data as Record<string, unknown>)
        : {};
    return {
      granularity: "document",
      chunksAnalyzed: chunks.length,
      ...parsed,
    };
  },
});
