/**
 * Extract Key Topics Tool
 *
 * Extract main topics from a text dataset using AI.
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

interface ExtractedTopic {
  description: string;
  name: string;
  relevance: number;
}

export interface ExtractKeyTopicsParams {
  concurrency?: number;
  datasetId: string;
  maxTopics?: number;
}

export default defineAction<ExtractKeyTopicsParams, unknown>({
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
    maxTopics: {
      default: 10,
      integer: true,
      max: 20,
      min: 1,
      optional: true,
      type: "number",
    },
  },

  async handler(ctx: TypedContext<ExtractKeyTopicsParams>) {
    const { concurrency = 1, datasetId, maxTopics = 10 } = ctx.params;

    await ctx.call("dataset.getDataset", { id: datasetId });
    const chunkRepo = dataSource.getRepository(TextChunk);

    const ai = createAIAdapter();
    const mergedByName = new Map<
      string,
      {
        count: number;
        description: string;
        name: string;
        relevanceTotal: number;
      }
    >();

    const { totalChunks } = await scanTextChunkPages({
      chunkRepo,
      datasetId,
      onPage: async ({ chunks }) => {
        const chunkBatches = splitIntoBatchesByChars({
          getLength: (chunk) => chunk.content.length,
          items: chunks,
          maxChars: MAX_CHARS_PER_BATCH,
        });

        const tasks = chunkBatches.map((batch) => async () => {
          const batchText = batch.map((chunk) => chunk.content).join("\n\n");
          const result = await ai.generateJSON({
            prompt: `Extract the top ${maxTopics} key topics from the following text. For each topic, provide a name, a brief description, and relevance score (0-1).

Return JSON format: { "topics": [{ "name": string, "description": string, "relevance": number }] }

Text:
${batchText.slice(0, MAX_CHARS_PER_BATCH)}`,
            schema: {
              type: "object",
              properties: {
                topics: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      description: { type: "string" },
                      relevance: { type: "number" },
                    },
                  },
                },
              },
            },
          });

          const parsed =
            result.data && typeof result.data === "object"
              ? (result.data as Record<string, unknown>)
              : {};
          return Array.isArray(parsed.topics)
            ? (parsed.topics as Record<string, unknown>[])
            : [];
        });

        const batchTopicGroups = await runWithConcurrency({
          concurrency,
          tasks,
        });

        for (const topics of batchTopicGroups) {
          for (const topic of topics) {
            const name = String(topic.name || "").trim();
            if (!name) {
              continue;
            }

            const relevance = Number(topic.relevance || 0);
            const normalizedName = name.toLowerCase();
            const description = String(topic.description || "").trim();
            const previous = mergedByName.get(normalizedName);

            if (!previous) {
              mergedByName.set(normalizedName, {
                count: 1,
                description,
                name,
                relevanceTotal: Number.isFinite(relevance) ? relevance : 0,
              });
              continue;
            }

            mergedByName.set(normalizedName, {
              count: previous.count + 1,
              description:
                description.length > previous.description.length
                  ? description
                  : previous.description,
              name: previous.name,
              relevanceTotal:
                previous.relevanceTotal +
                (Number.isFinite(relevance) ? relevance : 0),
            });
          }
        }
      },
    });

    if (totalChunks === 0) {
      return { topics: [], message: "No text content found." };
    }

    const mergedTopics: ExtractedTopic[] = Array.from(mergedByName.values())
      .map((topic) => ({
        description: topic.description,
        name: topic.name,
        relevance: topic.relevanceTotal / topic.count,
      }))
      .sort((a, b) => b.relevance - a.relevance);

    const candidatesForReduce = mergedTopics.slice(0, maxTopics * 5);
    let finalTopics = mergedTopics.slice(0, maxTopics);

    if (candidatesForReduce.length > maxTopics) {
      const result = await ai.generateJSON({
        prompt: `Given these extracted topic candidates from different parts of a document, consolidate duplicates and return the best ${maxTopics} topics.

Topic candidates:
${JSON.stringify(candidatesForReduce)}

Return JSON format: { "topics": [{ "name": string, "description": string, "relevance": number }] }`,
        schema: {
          type: "object",
          properties: {
            topics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  relevance: { type: "number" },
                },
              },
            },
          },
        },
      });

      const parsed =
        result.data && typeof result.data === "object"
          ? (result.data as Record<string, unknown>)
          : {};

      if (Array.isArray(parsed.topics)) {
        finalTopics = (parsed.topics as ExtractedTopic[]).slice(0, maxTopics);
      }
    }

    return {
      chunksAnalyzed: totalChunks,
      topics: finalTopics,
    };
  },
});
