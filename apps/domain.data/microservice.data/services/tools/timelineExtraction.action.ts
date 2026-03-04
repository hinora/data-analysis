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
import {
  MAX_CHARS_PER_BATCH,
  runWithConcurrency,
  splitIntoBatchesByChars,
} from "../../lib/map-reduce";
import { scanTextChunkPages } from "../../lib/text-chunk-pagination";

interface TimelineEvent {
  date: string;
  event: string;
  participants: string[];
  significance: string;
}

export interface TimelineExtractionParams {
  concurrency?: number;
  datasetId: string;
}

export default defineAction<TimelineExtractionParams, unknown>({
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
  },

  async handler(ctx: TypedContext<TimelineExtractionParams>) {
    const { concurrency = 1, datasetId } = ctx.params;

    await ctx.call("dataset.getDataset", { id: datasetId });
    const chunkRepo = dataSource.getRepository(TextChunk);

    const ai = createAIAdapter();
    const extractedEvents: TimelineEvent[] = [];

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
            prompt: `Extract a timeline of events from the following text. For each event, identify the date or time reference, what happened, and any key participants.

Return JSON format: { "events": [{ "date": string, "event": string, "participants": [string], "significance": string }] }

Sort events chronologically.

Text:
${batchText.slice(0, MAX_CHARS_PER_BATCH)}`,
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
                      participants: {
                        type: "array",
                        items: { type: "string" },
                      },
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
              : {};
          return Array.isArray(parsed.events)
            ? (parsed.events as Record<string, unknown>[])
            : [];
        });

        const eventGroups = await runWithConcurrency({
          concurrency,
          tasks,
        });

        for (const events of eventGroups) {
          for (const event of events) {
            const date = String(event.date || "").trim();
            const description = String(event.event || "").trim();

            if (!date || !description) {
              continue;
            }

            extractedEvents.push({
              date,
              event: description,
              participants: Array.isArray(event.participants)
                ? (event.participants as string[])
                : [],
              significance: String(event.significance || "").trim(),
            });
          }
        }
      },
    });

    if (totalChunks === 0) {
      return { events: [], message: "No text content found." };
    }

    if (extractedEvents.length === 0) {
      return {
        chunksAnalyzed: totalChunks,
        events: [],
      };
    }

    const dedupeMap = new Map<string, TimelineEvent>();
    for (const item of extractedEvents) {
      const key = `${item.date.toLowerCase()}::${item.event.toLowerCase()}`;
      if (!dedupeMap.has(key)) {
        dedupeMap.set(key, item);
      }
    }

    const reducedCandidates = Array.from(dedupeMap.values()).slice(0, 200);
    const result = await ai.generateJSON({
      prompt: `You are given extracted timeline candidates from multiple parts of a document.
Merge duplicates, keep the most important events, and sort chronologically.

Return JSON format: { "events": [{ "date": string, "event": string, "participants": [string], "significance": string }] }

Candidates:
${JSON.stringify(reducedCandidates)}`,
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
        : {};

    return {
      chunksAnalyzed: totalChunks,
      events: Array.isArray(parsed.events)
        ? (parsed.events as unknown[])
        : reducedCandidates,
    };
  },
});
