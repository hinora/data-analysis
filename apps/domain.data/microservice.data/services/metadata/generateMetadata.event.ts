/**
 * Generate Metadata Event Handler
 *
 * Triggered by metadata.generateMetadata event. Generates AI metadata for datasets:
 * - Structured: column descriptions, summary statistics, dataset description
 * - Unstructured: key topics, document summary, content domain, entities, word count
 * - Unstructured embeddings: generates vector embeddings for each text chunk via AI adapter
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
import {
  Dataset,
  DatasetType,
  MetadataStatus,
  type RelationshipSuggestion,
  type StructuredMetadata,
  type UnstructuredMetadata,
} from "../../db/dataset.entity";
import { TextChunk } from "../../db/text-chunk.entity";
import {
  extractMetadataBatch,
  MAX_CHARS_PER_BATCH,
  mergePartialMetadata,
  type PartialUnstructuredMetadata,
  reduceTextSummaries,
  runWithConcurrency,
  splitIntoBatchesByChars,
} from "../../lib/map-reduce";

export interface DatasetEntry {
  datasetId: string;
  datasetType: string;
  name: string;
}

export interface GenerateMetadataPayload {
  datasets: DatasetEntry[];
  sessionId: string;
}

export default defineEvent<GenerateMetadataPayload>({
  group: "metadata-workers",

  async handler(ctx: TypedContext<GenerateMetadataPayload>) {
    const { datasets, sessionId } = ctx.params;

    ctx.broker.logger.info(
      `Starting sequential metadata generation for ${datasets.length} dataset(s) in session ${sessionId}`,
    );

    // Process datasets one by one to limit Ollama concurrency
    for (const entry of datasets) {
      await processOneDataset(entry, sessionId, ctx);
    }

    ctx.broker.logger.info(
      `All metadata generation complete for session ${sessionId} (${datasets.length} datasets)`,
    );
  },
});

async function processOneDataset(
  entry: DatasetEntry,
  sessionId: string,
  ctx: TypedContext<GenerateMetadataPayload>,
) {
  const { datasetId, datasetType } = entry;
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
      await generateTextChunkEmbeddings(dataset, ai, aiLogRepo, ctx);
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
}

async function generateStructuredMetadata(
  dataset: Dataset,
  ai: ReturnType<typeof createAIAdapter>,
  aiLogRepo: Repository<AILog>,
  _ctx: TypedContext<GenerateMetadataPayload>,
) {
  const recordRepo = dataSource.getRepository(DataRecord);

  // Get sample rows (first 20) for the AI to analyse
  const sampleRows = await recordRepo.find({
    where: { datasetId: dataset.id },
    take: 10,
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
    structuredMetadata: metadata as unknown as StructuredMetadata,
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
  ctx: TypedContext<GenerateMetadataPayload>,
) {
  const chunkRepo = dataSource.getRepository(TextChunk);
  const logger = ctx.broker.logger;

  // Count total chunks and compute word count via paginated scan
  const totalChunks = await chunkRepo.count({
    where: { datasetId: dataset.id },
  });

  if (totalChunks === 0) {
    logger.info(
      `[generateUnstructuredMetadata] No chunks found for dataset ${dataset.id}`,
    );
    await dataSource.getRepository(Dataset).update(dataset.id, {
      unstructuredMetadata: {
        chunkCount: 0,
        contentDomain: "unknown",
        documentSummary: "No text content found.",
        entities: [],
        keyTopics: [],
        wordCount: 0,
      },
    });
    return;
  }

  const PAGE_SIZE = 100;
  let wordCount = 0;
  const allChunkTexts: string[] = [];

  // Paginated scan: collect all chunk texts and count words
  for (let page = 0; page * PAGE_SIZE < totalChunks; page++) {
    const chunks = await chunkRepo.find({
      where: { datasetId: dataset.id },
      order: { orderIndex: "ASC" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    for (const chunk of chunks) {
      allChunkTexts.push(chunk.content);
      wordCount += chunk.content.split(/\s+/).filter(Boolean).length;
    }
  }

  logger.info(
    `[generateUnstructuredMetadata] dataset ${dataset.id}: ${totalChunks} chunks, ${wordCount} words`,
  );

  const overallStartTime = Date.now();

  // --- Map phase: extract partial metadata from each batch ---
  const textBatches = splitIntoBatchesByChars({
    getLength: (t) => t.length,
    items: allChunkTexts,
    maxChars: MAX_CHARS_PER_BATCH,
  });

  logger.info(
    `[generateUnstructuredMetadata] map phase — ${textBatches.length} batches (max ${MAX_CHARS_PER_BATCH} chars/batch)`,
  );

  const mapTasks = textBatches.map(
    (batch, index) => (): Promise<PartialUnstructuredMetadata> => {
      const batchText = batch.join("\n\n");
      return extractMetadataBatch({
        ai,
        batchIndex: index,
        logger,
        text: batchText,
        totalBatches: textBatches.length,
      });
    },
  );

  const partialResults = await runWithConcurrency({
    concurrency: 1,
    tasks: mapTasks,
  });

  // Log map phase AI interactions
  for (let i = 0; i < partialResults.length; i++) {
    await aiLogRepo.save(
      aiLogRepo.create({
        type: AILogType.METADATA,
        sessionId: dataset.sessionId,
        datasetId: dataset.id,
        purpose: AILogPurpose.UNSTRUCTURED_METADATA,
        promptSent: `Metadata extraction batch ${i + 1}/${partialResults.length}`,
        responseReceived: JSON.stringify(partialResults[i]),
        model:
          ai.getConfig?.()?.defaultModel ||
          process.env.OLLAMA_MODEL ||
          "unknown",
        provider: process.env.AI_PROVIDER || "ollama",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
        status: AILogStatus.SUCCESS,
      }),
    );
  }

  // --- Reduce phase: merge partial metadata ---
  const merged = mergePartialMetadata(partialResults);

  // Reduce the merged summaries into a single cohesive summary
  const batchSummaries = partialResults
    .map((p) => p.documentSummary)
    .filter(Boolean);

  let finalSummary: string;
  if (batchSummaries.length <= 1) {
    finalSummary = batchSummaries[0] || "";
  } else {
    finalSummary = await reduceTextSummaries({
      ai,
      concurrency: 1,
      logger,
      summaries: batchSummaries,
    });
  }

  const latencyMs = Date.now() - overallStartTime;

  const metadata: UnstructuredMetadata = {
    chunkCount: totalChunks,
    contentDomain: merged.contentDomain,
    documentSummary: finalSummary,
    entities: merged.entities,
    keyTopics: merged.keyTopics,
    wordCount,
  };

  await dataSource.getRepository(Dataset).update(dataset.id, {
    unstructuredMetadata: metadata,
  });

  // Log final reduce result
  await aiLogRepo.save(
    aiLogRepo.create({
      type: AILogType.METADATA,
      sessionId: dataset.sessionId,
      datasetId: dataset.id,
      purpose: AILogPurpose.UNSTRUCTURED_METADATA,
      promptSent: `Map-reduce metadata generation: ${textBatches.length} batches, ${totalChunks} chunks`,
      responseReceived: JSON.stringify(metadata),
      model:
        ai.getConfig?.()?.defaultModel || process.env.OLLAMA_MODEL || "unknown",
      provider: process.env.AI_PROVIDER || "ollama",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs,
      status: AILogStatus.SUCCESS,
    }),
  );

  logger.info(
    `[generateUnstructuredMetadata] complete for dataset ${dataset.id}: ${totalChunks} chunks, ${textBatches.length} batches, ${latencyMs}ms`,
  );
}

/**
 * Generate vector embeddings for all text chunks in an unstructured dataset.
 * Uses paginated DB queries to limit memory usage, then processes each page
 * in embedding batches. Stores embeddings as JSON string arrays in TextChunk.embedding.
 */
async function generateTextChunkEmbeddings(
  dataset: Dataset,
  ai: ReturnType<typeof createAIAdapter>,
  aiLogRepo: Repository<AILog>,
  ctx: TypedContext<GenerateMetadataPayload>,
) {
  const chunkRepo = dataSource.getRepository(TextChunk);

  // Count total chunks first to drive pagination
  const totalChunks = await chunkRepo.count({
    where: { datasetId: dataset.id },
  });

  if (totalChunks === 0) {
    ctx.broker.logger.info(
      `No text chunks found for dataset ${dataset.id}, skipping embedding generation`,
    );
    return;
  }

  const PAGE_SIZE = 100;
  const EMBEDDING_BATCH_SIZE = 20;
  let totalDurationMs = 0;
  let embeddedCount = 0;
  let globalBatchIndex = 0;

  ctx.broker.logger.info(
    `Starting embedding generation for dataset ${dataset.id}: ${totalChunks} total chunks (page size: ${PAGE_SIZE})`,
  );

  for (let page = 0; page * PAGE_SIZE < totalChunks; page++) {
    const skip = page * PAGE_SIZE;

    ctx.broker.logger.info(
      `Loading chunk page ${page + 1} (chunks ${skip + 1}–${Math.min(skip + PAGE_SIZE, totalChunks)} of ${totalChunks}) for dataset ${dataset.id}`,
    );

    const chunks = await chunkRepo.find({
      where: { datasetId: dataset.id },
      order: { orderIndex: "ASC" },
      skip,
      take: PAGE_SIZE,
    });

    // Process each page in embedding batches
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const texts = batch.map((c) => c.content);
      globalBatchIndex++;

      const chunkStartIndex = skip + i + 1;
      const chunkEndIndex = skip + i + batch.length;

      ctx.broker.logger.info(
        `Processing embedding batch ${globalBatchIndex} — chunks ${chunkStartIndex}–${chunkEndIndex} of ${totalChunks} (dataset ${dataset.id})`,
      );

      const startTime = Date.now();
      const result = await ai.generateEmbeddings({ input: texts });
      const latencyMs = Date.now() - startTime;
      totalDurationMs += latencyMs;

      // Update each chunk with its embedding
      for (let j = 0; j < batch.length; j++) {
        const embedding = result.embeddings[j];
        if (embedding) {
          await chunkRepo.update(batch[j].id, {
            embedding: JSON.stringify(embedding),
          });
          embeddedCount++;
        }
      }

      ctx.broker.logger.info(
        `Embedding batch ${globalBatchIndex} complete — ${result.embeddings.length} embeddings generated in ${latencyMs}ms (dataset ${dataset.id})`,
      );

      // Log each batch
      await aiLogRepo.save(
        aiLogRepo.create({
          type: AILogType.METADATA,
          sessionId: dataset.sessionId,
          datasetId: dataset.id,
          purpose: AILogPurpose.EMBEDDING_GENERATION,
          promptSent: `Embedding batch ${globalBatchIndex}: chunks ${chunkStartIndex}–${chunkEndIndex} (${texts.length} chunks)`,
          responseReceived: `Generated ${result.embeddings.length} embeddings (${result.dimensions}d)`,
          model: result.model,
          provider: process.env.AI_PROVIDER || "ollama",
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs,
          status: AILogStatus.SUCCESS,
        }),
      );
    }

    // Allow GC to reclaim the page before loading the next one
  }

  ctx.broker.logger.info(
    `Embedding generation complete for dataset ${dataset.id}: ${embeddedCount}/${totalChunks} chunks embedded in ${totalDurationMs}ms`,
  );
}

async function detectRelationships(
  dataset: Dataset,
  datasetRepo: Repository<Dataset>,
  _ai: ReturnType<typeof createAIAdapter>,
  _aiLogRepo: Repository<AILog>,
  _ctx: TypedContext<GenerateMetadataPayload>,
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
      (
        (dataset.unstructuredMetadata as UnstructuredMetadata).keyTopics || []
      ).map((t: string) => t.toLowerCase()),
    );

    for (const sibling of siblings) {
      if (!sibling.unstructuredMetadata) continue;
      const siblingTopics = (
        (sibling.unstructuredMetadata as UnstructuredMetadata).keyTopics || []
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
      relationships: relationships as RelationshipSuggestion[],
    });
  }
}
