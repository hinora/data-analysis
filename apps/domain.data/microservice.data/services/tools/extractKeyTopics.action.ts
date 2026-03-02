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

export interface ExtractKeyTopicsParams {
  datasetId: string;
  maxTopics?: number;
}

export default defineAction<ExtractKeyTopicsParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    maxTopics: {
      type: "number",
      integer: true,
      min: 1,
      max: 20,
      optional: true,
      default: 10,
    },
  },

  async handler(ctx: TypedContext<ExtractKeyTopicsParams>) {
    const { datasetId, maxTopics = 10 } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const chunkRepo = dataSource.getRepository(TextChunk);

    const chunks = await chunkRepo.find({
      where: { datasetId },
      order: { orderIndex: "ASC" },
      take: 20,
    });

    if (chunks.length === 0) {
      return { topics: [], message: "No text content found." };
    }

    const combinedText = chunks.map((c) => c.content).join("\n\n");

    const ai = createAIAdapter();
    const result = await ai.generateJSON({
      prompt: `Extract the top ${maxTopics} key topics from the following text. For each topic, provide a name, a brief description, and relevance score (0-1).

Return JSON format: { "topics": [{ "name": string, "description": string, "relevance": number }] }

Text:
${combinedText.slice(0, 10000)}`,
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
        : ({} as Record<string, unknown>);
    return {
      topics: (parsed.topics as unknown[]) || [],
      chunksAnalyzed: chunks.length,
    };
  },
});
