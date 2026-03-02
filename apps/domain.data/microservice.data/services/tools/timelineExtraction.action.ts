/**
 * Timeline Extraction Tool
 *
 * Extract temporal events and dates from text documents.
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { TextChunk } from "../../db/text-chunk.entity";

export interface TimelineExtractionParams {
  datasetId: string;
}

export default defineAction<TimelineExtractionParams, unknown>({
  params: {
    datasetId: { type: "uuid" },
  },

  async handler(ctx: TypedContext<TimelineExtractionParams>) {
    const { datasetId } = ctx.params;
    await ctx.call("dataset.getDataset", { id: datasetId });
    const chunkRepo = dataSource.getRepository(TextChunk);

    const chunks = await chunkRepo.find({
      where: { datasetId },
      order: { orderIndex: "ASC" },
      take: 20,
    });

    if (chunks.length === 0) {
      return { events: [], message: "No text content found." };
    }

    const combinedText = chunks.map((c) => c.content).join("\n\n");

    const ai = createAIAdapter();
    const result = await ai.generateJSON({
      prompt: `Extract a timeline of events from the following text. For each event, identify the date or time reference, what happened, and any key participants.

Return JSON format: { "events": [{ "date": string, "event": string, "participants": [string], "significance": string }] }

Sort events chronologically.

Text:
${combinedText.slice(0, 10000)}`,
      schema: {
        type: "object",
        properties: {
          events: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                event: { type: "string" },
                participants: { type: "array", items: { type: "string" } },
                significance: { type: "string" },
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
      events: (parsed.events as unknown[]) || [],
      chunksAnalyzed: chunks.length,
    };
  },
});
