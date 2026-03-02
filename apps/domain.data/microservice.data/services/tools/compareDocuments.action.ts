/**
 * Compare Documents Tool
 *
 * Compare two text datasets for similarities and differences.
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineAction } from "core.lib/broker";
import { dataSource } from "../../db";
import { Dataset } from "../../db/dataset.entity";
import { TextChunk } from "../../db/text-chunk.entity";

export interface CompareDocumentsParams {
  datasetId1: string;
  datasetId2: string;
}

export default defineAction<CompareDocumentsParams, unknown>({
  params: {
    datasetId1: { type: "uuid" },
    datasetId2: { type: "uuid" },
  },

  async handler(ctx: TypedContext<CompareDocumentsParams>) {
    const { datasetId1, datasetId2 } = ctx.params;
    const chunkRepo = dataSource.getRepository(TextChunk);
    const datasetRepo = dataSource.getRepository(Dataset);

    // Get dataset info
    const [dataset1, dataset2] = await Promise.all([
      datasetRepo.findOneBy({ id: datasetId1 }),
      datasetRepo.findOneBy({ id: datasetId2 }),
    ]);

    // Get chunks from both datasets
    const [chunks1, chunks2] = await Promise.all([
      chunkRepo.find({
        where: { datasetId: datasetId1 },
        order: { orderIndex: "ASC" },
        take: 10,
      }),
      chunkRepo.find({
        where: { datasetId: datasetId2 },
        order: { orderIndex: "ASC" },
        take: 10,
      }),
    ]);

    const text1 = chunks1
      .map((c) => c.content)
      .join("\n\n")
      .slice(0, 5000);
    const text2 = chunks2
      .map((c) => c.content)
      .join("\n\n")
      .slice(0, 5000);

    if (!text1 || !text2) {
      return {
        comparison: "One or both documents have no text content.",
        similarities: [],
        differences: [],
      };
    }

    const ai = createAIAdapter();
    const result = await ai.generateJSON({
      prompt: `Compare the following two documents. Identify similarities, differences, and provide an overall comparison.

Document 1 (${dataset1?.name || "Unknown"}):
${text1}

Document 2 (${dataset2?.name || "Unknown"}):
${text2}

Return JSON format: {
  "summary": string,
  "similarities": [string],
  "differences": [string],
  "overlapScore": number (0-1)
}`,
      schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          similarities: { type: "array", items: { type: "string" } },
          differences: { type: "array", items: { type: "string" } },
          overlapScore: { type: "number" },
        },
      },
    });

    const parsed =
      result.data && typeof result.data === "object"
        ? (result.data as Record<string, unknown>)
        : {};
    return {
      document1: dataset1?.name || datasetId1,
      document2: dataset2?.name || datasetId2,
      ...parsed,
    };
  },
});
