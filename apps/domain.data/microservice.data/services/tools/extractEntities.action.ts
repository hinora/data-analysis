/**
 * Extract Entities Tool
 *
 * Extract named entities (people, organizations, dates, locations, monetary values) from text.
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { TextChunk } from "../../db/text-chunk.entity";

export interface ExtractEntitiesParams {
  datasetId: string;
  entityTypes?: string[];
}

export default defineAction<ExtractEntitiesParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
    entityTypes: {
      type: "array",
      items: "string",
      optional: true,
      default: ["person", "organization", "date", "location", "monetary"],
    },
  },

  async handler(ctx: TypedContext<ExtractEntitiesParams>) {
    const {
      datasetId,
      entityTypes = ["person", "organization", "date", "location", "monetary"],
    } = ctx.params;
    const chunkRepo = dataSource.getRepository(TextChunk);

    const chunks = await chunkRepo.find({
      where: { datasetId },
      order: { orderIndex: "ASC" },
      take: 15,
    });

    if (chunks.length === 0) {
      return { entities: [], message: "No text content found." };
    }

    const combinedText = chunks.map((c) => c.content).join("\n\n");

    const ai = createAIAdapter();
    const result = await ai.generateJSON({
      prompt: `Extract named entities from the following text. Focus on these entity types: ${entityTypes.join(", ")}.

For each entity, provide: name, type, count of occurrences, and an example sentence where it appears.

Return JSON format: { "entities": [{ "name": string, "type": string, "count": number, "context": string }] }

Text:
${combinedText.slice(0, 10000)}`,
      schema: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string" },
                count: { type: "number" },
                context: { type: "string" },
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
      entities: (parsed.entities as unknown[]) || [],
      entityTypes,
      chunksAnalyzed: chunks.length,
    };
  },
});
