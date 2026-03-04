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
import {
  MAX_CHARS_PER_BATCH,
  runWithConcurrency,
  splitIntoBatchesByChars,
} from "../../lib/map-reduce";
import { scanTextChunkPages } from "../../lib/text-chunk-pagination";

interface ChunkSentimentResult {
  chunkIndex: number;
  keyPhrases: string[];
  score: number;
  sentiment: string;
}

interface SentimentTheme {
  score: number;
  sentiment: string;
  theme: string;
}

interface DocumentSentimentResult {
  score: number;
  sentiment: string;
  themes: SentimentTheme[];
  tones: string[];
}

export interface SentimentAnalysisParams {
  concurrency?: number;
  datasetId: string;
  granularity?: string;
}

export default defineAction<SentimentAnalysisParams, unknown>({
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
    granularity: {
      default: "document",
      optional: true,
      type: "enum",
      values: ["document", "chunk"],
    },
  },

  async handler(ctx: TypedContext<SentimentAnalysisParams>) {
    const { concurrency = 1, datasetId, granularity = "document" } = ctx.params;

    await ctx.call("dataset.getDataset", { id: datasetId });
    const chunkRepo = dataSource.getRepository(TextChunk);

    const ai = createAIAdapter();

    const chunkResults: ChunkSentimentResult[] = [];
    const documentPartials: DocumentSentimentResult[] = [];

    const { totalChunks } = await scanTextChunkPages({
      chunkRepo,
      datasetId,
      onPage: async ({ chunks }) => {
        if (granularity === "chunk") {
          const tasks = chunks.map((chunk) => async () => {
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

            return {
              chunkIndex: chunk.orderIndex,
              keyPhrases: Array.isArray(parsed.keyPhrases)
                ? (parsed.keyPhrases as string[])
                : [],
              score: Number(parsed.score || 0),
              sentiment: String(parsed.sentiment || ""),
            } satisfies ChunkSentimentResult;
          });

          const pageResults = await runWithConcurrency({
            concurrency,
            tasks,
          });

          chunkResults.push(...pageResults);
          return;
        }

        const chunkBatches = splitIntoBatchesByChars({
          getLength: (chunk) => chunk.content.length,
          items: chunks,
          maxChars: MAX_CHARS_PER_BATCH,
        });

        const tasks = chunkBatches.map((batch) => async () => {
          const batchText = batch.map((chunk) => chunk.content).join("\n\n");
          const result = await ai.generateJSON({
            prompt: `Analyze the overall sentiment of the following document excerpt. Provide:
- Overall sentiment (positive, negative, neutral, mixed)
- Score from -1 (most negative) to 1 (most positive)
- Key themes and their sentiments
- Notable emotional tones

Return JSON: { "sentiment": string, "score": number, "themes": [{ "theme": string, "sentiment": string, "score": number }], "tones": [string] }

Text:
${batchText.slice(0, MAX_CHARS_PER_BATCH)}`,
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
            score: Number(parsed.score || 0),
            sentiment: String(parsed.sentiment || ""),
            themes: Array.isArray(parsed.themes)
              ? (parsed.themes as SentimentTheme[])
              : [],
            tones: Array.isArray(parsed.tones)
              ? (parsed.tones as string[])
              : [],
          } satisfies DocumentSentimentResult;
        });

        const pagePartials = await runWithConcurrency({
          concurrency,
          tasks,
        });

        documentPartials.push(...pagePartials);
      },
    });

    if (totalChunks === 0) {
      return { sentiment: null, message: "No text content found." };
    }

    if (granularity === "chunk") {
      const sortedChunkResults = chunkResults.sort(
        (a, b) => a.chunkIndex - b.chunkIndex,
      );

      const avgScore =
        sortedChunkResults.reduce(
          (sum, result) => sum + (result.score || 0),
          0,
        ) / sortedChunkResults.length;

      return {
        chunks: sortedChunkResults,
        chunksAnalyzed: sortedChunkResults.length,
        granularity: "chunk",
        overallScore: avgScore,
        overallSentiment:
          avgScore > 0.2
            ? "positive"
            : avgScore < -0.2
              ? "negative"
              : "neutral",
      };
    }

    const avgScore =
      documentPartials.reduce((sum, partial) => sum + (partial.score || 0), 0) /
      documentPartials.length;

    const sentiment =
      avgScore > 0.2 ? "positive" : avgScore < -0.2 ? "negative" : "neutral";

    const themeMap = new Map<
      string,
      { count: number; scoreTotal: number; theme: string }
    >();
    const toneMap = new Map<string, number>();

    for (const partial of documentPartials) {
      for (const theme of partial.themes) {
        const themeName = String(theme.theme || "").trim();
        if (!themeName) {
          continue;
        }

        const key = themeName.toLowerCase();
        const previous = themeMap.get(key);
        if (!previous) {
          themeMap.set(key, {
            count: 1,
            scoreTotal: Number(theme.score || 0),
            theme: themeName,
          });
          continue;
        }

        themeMap.set(key, {
          count: previous.count + 1,
          scoreTotal: previous.scoreTotal + Number(theme.score || 0),
          theme: previous.theme,
        });
      }

      for (const tone of partial.tones) {
        const normalizedTone = String(tone || "")
          .trim()
          .toLowerCase();
        if (!normalizedTone) {
          continue;
        }
        toneMap.set(normalizedTone, (toneMap.get(normalizedTone) || 0) + 1);
      }
    }

    const themes = Array.from(themeMap.values())
      .map((theme) => {
        const themeScore = theme.scoreTotal / theme.count;
        return {
          score: themeScore,
          sentiment:
            themeScore > 0.2
              ? "positive"
              : themeScore < -0.2
                ? "negative"
                : "neutral",
          theme: theme.theme,
        } satisfies SentimentTheme;
      })
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 10);

    const tones = Array.from(toneMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tone]) => tone)
      .slice(0, 10);

    return {
      granularity: "document",
      chunksAnalyzed: totalChunks,
      score: avgScore,
      sentiment,
      themes,
      tones,
    };
  },
});
