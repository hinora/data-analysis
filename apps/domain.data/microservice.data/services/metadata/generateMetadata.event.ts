/**
 * Generate Metadata Event Handler
 *
 * Triggered by metadata.generateMetadata event. Generates AI metadata for datasets:
 * - Structured: column descriptions, summary statistics, dataset description
 * - Unstructured: key topics, document summary, content domain, entities, word count
 * - Relationship detection: scan session datasets for shared columns/topics
 *
 * Updates dataset metadataStatus through pending → in-progress → ready/failed.
 * Logs all AI interactions to AILog.
 */

import type { TypedContext } from "core.lib/__generated__";
import { createAIAdapter } from "core.lib/adapters/ai";
import { defineEvent } from "core.lib/broker";
import { AILog, AILogPurpose, AILogStatus, AILogType } from "core.lib/database";
import type { Repository } from "typeorm";
import { dataSource } from "../../db";
import { DataRecord } from "../../db/data-record.entity";
import { Dataset, DatasetType, MetadataStatus } from "../../db/dataset.entity";
import { TextChunk } from "../../db/text-chunk.entity";

export interface DatasetImportedPayload {
  datasetId: string;
  sessionId: string;
  datasetType: string;
  name: string;
}

export default defineEvent<DatasetImportedPayload>({
  group: "metadata-workers",

  async handler(ctx: TypedContext<DatasetImportedPayload>) {
    const { datasetId, sessionId, datasetType } = ctx.params;
    const datasetRepo = dataSource.getRepository(Dataset);
    const aiLogRepo = dataSource.getRepository(AILog);

    // Set status to in-progress
    await datasetRepo.update(datasetId, {
      metadataStatus: MetadataStatus.IN_PROGRESS,
    });

    const ai = createAIAdapter();
    const startTime = Date.now();

    try {
      const dataset = await datasetRepo.findOneBy({ id: datasetId });
      if (!dataset) {
        ctx.broker.logger.warn(
          `Dataset ${datasetId} not found for metadata generation`,
        );
        return;
      }

      if (datasetType === DatasetType.STRUCTURED_TABLE) {
        await generateStructuredMetadata(dataset, ai, aiLogRepo, ctx);
      } else {
        await generateUnstructuredMetadata(dataset, ai, aiLogRepo, ctx);
      }

      // Relationship detection
      await detectRelationships(dataset, datasetRepo, ai, aiLogRepo, ctx);

      // Mark as ready
      await datasetRepo.update(datasetId, {
        metadataStatus: MetadataStatus.READY,
      });

      ctx.broker.logger.info(
        `Metadata generation complete for dataset ${datasetId} (${Date.now() - startTime}ms)`,
      );

      // Emit metadata ready event
      await ctx.emit("datasetEvent.metadataReady", {
        datasetId,
        sessionId,
        name: dataset.name,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      ctx.broker.logger.error(
        `Metadata generation failed for dataset ${datasetId}: ${errorMessage}`,
      );

      await datasetRepo.update(datasetId, {
        metadataStatus: MetadataStatus.FAILED,
      });

      // Log failure
      await aiLogRepo.save(
        aiLogRepo.create({
          type: AILogType.METADATA,
          sessionId,
          datasetId,
          purpose: AILogPurpose.STRUCTURED_METADATA,
          promptSent: "metadata generation failed",
          responseReceived: errorMessage,
          model:
            ai.getConfig?.()?.defaultModel ||
            process.env.OLLAMA_MODEL ||
            "unknown",
          provider: process.env.AI_PROVIDER || "ollama",
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs: Date.now() - startTime,
          status: AILogStatus.FAILED,
          errorMessage,
        }),
      );
    }
  },
});

async function generateStructuredMetadata(
  dataset: Dataset,
  ai: ReturnType<typeof createAIAdapter>,
  aiLogRepo: Repository<AILog>,
  _ctx: TypedContext<DatasetImportedPayload>,
) {
  const recordRepo = dataSource.getRepository(DataRecord);

  // Get sample rows (first 20) for the AI to analyse
  const sampleRows = await recordRepo.find({
    where: { datasetId: dataset.id },
    take: 20,
  });

  const columnMappings = dataset.columnMappings || [];
  const columnList = columnMappings
    .map(
      (c) => `- "${c.original}" (key: ${c.camelCase}, type: ${c.detectedType})`,
    )
    .join("\n");

  const sampleData = sampleRows
    .slice(0, 5)
    .map((r) => JSON.stringify(r.data))
    .join("\n");

  const prompt = `Analyse this structured dataset and generate metadata.

Dataset: "${dataset.name}"
Columns (${columnMappings.length}):
${columnList}

Sample rows (${sampleRows.length} of ${dataset.rowCount} total):
${sampleData}

Respond with a JSON object (no markdown, no code blocks) with exactly this structure:
{
  "datasetDescription": "A brief description of what this dataset contains",
  "columnDescriptions": [
    {
      "columnKey": "camelCaseKey",
      "columnOriginal": "Original Column Name",
      "description": "What this column represents",
      "exampleValues": ["val1", "val2", "val3"]
    }
  ],
  "statistics": [
    {
      "columnKey": "camelCaseKey",
      "nullCount": 0,
      "uniqueCount": 10,
      "min": null,
      "max": null,
      "average": null,
      "topFrequentValues": [{"value": "x", "count": 5}]
    }
  ]
}`;

  const startTime = Date.now();
  const response = await ai.generateJSON({ prompt });
  const latencyMs = Date.now() - startTime;

  // Parse and store metadata
  const metadata: Record<string, unknown> =
    response.data && typeof response.data === "object"
      ? (response.data as Record<string, unknown>)
      : {
          datasetDescription: response.rawResponse,
          columnDescriptions: [],
          statistics: [],
        };

  await dataSource.getRepository(Dataset).update(dataset.id, {
    structuredMetadata: metadata as any,
  });

  // Log AI interaction
  await aiLogRepo.save(
    aiLogRepo.create({
      type: AILogType.METADATA,
      sessionId: dataset.sessionId,
      datasetId: dataset.id,
      purpose: AILogPurpose.STRUCTURED_METADATA,
      promptSent: prompt,
      responseReceived: response.rawResponse,
      model:
        ai.getConfig?.()?.defaultModel || process.env.OLLAMA_MODEL || "unknown",
      provider: process.env.AI_PROVIDER || "ollama",
      promptTokens: response.promptTokens || 0,
      completionTokens: response.completionTokens || 0,
      totalTokens: response.totalTokens || 0,
      latencyMs,
      status: AILogStatus.SUCCESS,
    }),
  );
}

async function generateUnstructuredMetadata(
  dataset: Dataset,
  ai: ReturnType<typeof createAIAdapter>,
  aiLogRepo: Repository<AILog>,
  _ctx: TypedContext<DatasetImportedPayload>,
) {
  const chunkRepo = dataSource.getRepository(TextChunk);

  // Get all chunks (or first 50 for very large documents)
  const chunks = await chunkRepo.find({
    where: { datasetId: dataset.id },
    order: { orderIndex: "ASC" },
    take: 50,
  });

  const combinedText = chunks.map((c) => c.content).join("\n\n");
  const wordCount = combinedText.split(/\s+/).filter(Boolean).length;

  const prompt = `Analyse this unstructured text document and generate metadata.

Document: "${dataset.name}"
Chunks: ${chunks.length} (of ${dataset.rowCount} total)
Text excerpt (first ~3000 chars):
${combinedText.slice(0, 3000)}

Respond with a JSON object (no markdown, no code blocks) with exactly this structure:
{
  "documentSummary": "A concise summary of the document",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "contentDomain": "e.g. financial, legal, scientific, general",
  "entities": [
    {"name": "Entity Name", "type": "person|organisation|location|date|monetary", "count": 1}
  ],
  "wordCount": ${wordCount},
  "chunkCount": ${chunks.length}
}`;

  const startTime = Date.now();
  const response = await ai.generateJSON({ prompt });
  const latencyMs = Date.now() - startTime;

  const metadata: Record<string, unknown> =
    response.data && typeof response.data === "object"
      ? (response.data as Record<string, unknown>)
      : {
          documentSummary: response.rawResponse,
          keyTopics: [],
          contentDomain: "unknown",
          entities: [],
          wordCount,
          chunkCount: chunks.length,
        };

  await dataSource.getRepository(Dataset).update(dataset.id, {
    unstructuredMetadata: metadata as any,
  });

  // Log AI interaction
  await aiLogRepo.save(
    aiLogRepo.create({
      type: AILogType.METADATA,
      sessionId: dataset.sessionId,
      datasetId: dataset.id,
      purpose: AILogPurpose.UNSTRUCTURED_METADATA,
      promptSent: prompt,
      responseReceived: response.rawResponse,
      model:
        ai.getConfig?.()?.defaultModel || process.env.OLLAMA_MODEL || "unknown",
      provider: process.env.AI_PROVIDER || "ollama",
      promptTokens: response.promptTokens || 0,
      completionTokens: response.completionTokens || 0,
      totalTokens: response.totalTokens || 0,
      latencyMs,
      status: AILogStatus.SUCCESS,
    }),
  );
}

async function detectRelationships(
  dataset: Dataset,
  datasetRepo: Repository<Dataset>,
  _ai: ReturnType<typeof createAIAdapter>,
  _aiLogRepo: Repository<AILog>,
  _ctx: TypedContext<DatasetImportedPayload>,
) {
  // Find other datasets in the same session
  const otherDatasets = await datasetRepo.find({
    where: { sessionId: dataset.sessionId },
  });

  const siblings = otherDatasets.filter((d) => d.id !== dataset.id);
  if (siblings.length === 0) return;

  const relationships: Array<{
    description: string;
    relatedDatasetId: string;
    relatedDatasetName: string;
    relationshipType: "shared-column" | "shared-entity" | "shared-topic";
    sharedFields?: string[];
  }> = [];

  // Check for shared columns (structured datasets)
  if (dataset.columnMappings) {
    const myColumns = new Set(
      dataset.columnMappings.map((c) => c.camelCase.toLowerCase()),
    );

    for (const sibling of siblings) {
      if (!sibling.columnMappings) continue;
      const sharedFields = sibling.columnMappings
        .filter((c) => myColumns.has(c.camelCase.toLowerCase()))
        .map((c) => c.camelCase);

      if (sharedFields.length > 0) {
        relationships.push({
          relatedDatasetId: sibling.id,
          relatedDatasetName: sibling.name,
          relationshipType: "shared-column",
          sharedFields,
          description: `Shares ${sharedFields.length} column(s): ${sharedFields.join(", ")}`,
        });
      }
    }
  }

  // Check for shared topics/entities (unstructured datasets)
  if (dataset.unstructuredMetadata) {
    const myTopics = new Set(
      ((dataset.unstructuredMetadata as any).keyTopics || []).map((t: string) =>
        t.toLowerCase(),
      ),
    );

    for (const sibling of siblings) {
      if (!sibling.unstructuredMetadata) continue;
      const siblingTopics = (
        (sibling.unstructuredMetadata as any).keyTopics || []
      ).filter((t: string) => myTopics.has(t.toLowerCase()));

      if (siblingTopics.length > 0) {
        relationships.push({
          relatedDatasetId: sibling.id,
          relatedDatasetName: sibling.name,
          relationshipType: "shared-topic",
          sharedFields: siblingTopics,
          description: `Shares ${siblingTopics.length} topic(s): ${siblingTopics.join(", ")}`,
        });
      }
    }
  }

  if (relationships.length > 0) {
    await datasetRepo.update(dataset.id, {
      relationships: relationships as any,
    });
  }
}
