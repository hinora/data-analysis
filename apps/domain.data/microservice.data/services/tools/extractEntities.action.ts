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
import {
  MAX_CHARS_PER_BATCH,
  runWithConcurrency,
  splitIntoBatchesByChars,
} from "../../lib/map-reduce";
import { scanTextChunkPages } from "../../lib/text-chunk-pagination";

interface ExtractedEntity {
  context: string;
  count: number;
  name: string;
  type: string;
}

export interface ExtractEntitiesParams {
  concurrency?: number;
  datasetId: string;
  entityTypes?: string[];
}

export default defineAction<ExtractEntitiesParams, unknown>({
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
    entityTypes: {
      default: ["person", "organization", "date", "location", "monetary"],
      items: "string",
      optional: true,
      type: "array",
    },
  },

  async handler(ctx: TypedContext<ExtractEntitiesParams>) {
    const {
      concurrency = 1,
      datasetId,
      entityTypes = ["person", "organization", "date", "location", "monetary"],
    } = ctx.params;

    await ctx.call("dataset.getDataset", { id: datasetId });
    const chunkRepo = dataSource.getRepository(TextChunk);

    const ai = createAIAdapter();
    const mergedByKey = new Map<string, ExtractedEntity>();

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
            prompt: `Extract named entities from the following text. Focus on these entity types: ${entityTypes.join(", ")}.

For each entity, provide: name, type, count of occurrences, and an example sentence where it appears.

Return JSON format: { "entities": [{ "name": string, "type": string, "count": number, "context": string }] }

Text:
${batchText.slice(0, MAX_CHARS_PER_BATCH)}`,
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
              : {};
          return Array.isArray(parsed.entities)
            ? (parsed.entities as Record<string, unknown>[])
            : [];
        });

        const batchEntityGroups = await runWithConcurrency({
          concurrency,
          tasks,
        });

        for (const entities of batchEntityGroups) {
          for (const entity of entities) {
            const name = String(entity.name || "").trim();
            const type = String(entity.type || "")
              .trim()
              .toLowerCase();

            if (!name || !type) {
              continue;
            }

            const key = `${type}::${name.toLowerCase()}`;
            const count = Number(entity.count || 0);
            const context = String(entity.context || "").trim();
            const previous = mergedByKey.get(key);

            if (!previous) {
              mergedByKey.set(key, {
                context,
                count: Number.isFinite(count) ? Math.max(1, count) : 1,
                name,
                type,
              });
              continue;
            }

            mergedByKey.set(key, {
              context:
                context.length > previous.context.length
                  ? context
                  : previous.context,
              count:
                previous.count +
                (Number.isFinite(count) ? Math.max(1, count) : 1),
              name: previous.name,
              type: previous.type,
            });
          }
        }
      },
    });

    if (totalChunks === 0) {
      return { entities: [], message: "No text content found." };
    }

    const entities = Array.from(mergedByKey.values()).sort(
      (a, b) => b.count - a.count,
    );

    return {
      entities,
      entityTypes,
      chunksAnalyzed: totalChunks,
    };
  },
});
