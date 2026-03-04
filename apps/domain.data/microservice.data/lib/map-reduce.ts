/**
 * Map-Reduce Utilities
 *
 * Shared batching and concurrency helpers used by:
 * - summarizeDocument action (text summarization)
 * - generateMetadata event (unstructured metadata extraction)
 */

import type { AIAdapter } from "core.lib/adapters/ai";

export const MAX_CHARS_PER_BATCH = 12_000;

/**
 * Split items into batches where each batch's total character length
 * does not exceed the given limit.
 */
export function splitIntoBatchesByChars<T>(req: {
  getLength: (item: T) => number;
  items: T[];
  maxChars: number;
}): T[][] {
  const { getLength, items, maxChars } = req;
  const batches: T[][] = [];
  let currentBatch: T[] = [];
  let currentLength = 0;

  for (const item of items) {
    const itemLength = getLength(item);

    if (currentBatch.length > 0 && currentLength + itemLength > maxChars) {
      batches.push(currentBatch);
      currentBatch = [item];
      currentLength = itemLength;
    } else {
      currentBatch.push(item);
      currentLength += itemLength;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Run async tasks with a concurrency limit.
 * When concurrency is 1, tasks run sequentially.
 * When concurrency >= tasks.length, all run in parallel.
 */
export async function runWithConcurrency<T>(req: {
  concurrency: number;
  tasks: (() => Promise<T>)[];
}): Promise<T[]> {
  const { concurrency, tasks } = req;

  if (concurrency >= tasks.length) {
    return Promise.all(tasks.map((task) => task()));
  }

  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Logger interface for map-reduce operations. */
export interface MapReduceLogger {
  info: (msg: string) => void;
}

/**
 * Summarize a single batch of text content via AI.
 */
export async function summarizeTextBatch(req: {
  ai: AIAdapter;
  batchIndex: number;
  logger: MapReduceLogger;
  maxChars?: number;
  text: string;
  totalBatches: number;
}): Promise<string> {
  const {
    ai,
    batchIndex,
    logger,
    maxChars = MAX_CHARS_PER_BATCH,
    text,
    totalBatches,
  } = req;

  const batchContext =
    totalBatches > 1 ? ` (Part ${batchIndex + 1} of ${totalBatches})` : "";

  const truncatedLength = Math.min(text.length, maxChars);
  logger.info(
    `[map-reduce] summarizeTextBatch ${batchIndex + 1}/${totalBatches} — input: ${text.length} chars, truncated to: ${truncatedLength} chars`,
  );

  const start = Date.now();
  const result = await ai.generateText({
    prompt: `Provide a comprehensive summary of the following document content${batchContext}. Include key points, main themes, and important details.\n\n${text.slice(0, maxChars)}`,
  });

  logger.info(
    `[map-reduce] summarizeTextBatch ${batchIndex + 1}/${totalBatches} — completed in ${Date.now() - start}ms, output: ${result.content.length} chars`,
  );

  return result.content;
}

/**
 * Reduce multiple summaries into a single cohesive summary.
 * Applies recursively if intermediate summaries are still too numerous.
 */
export async function reduceTextSummaries(req: {
  ai: AIAdapter;
  concurrency: number;
  logger: MapReduceLogger;
  maxChars?: number;
  summaries: string[];
}): Promise<string> {
  const {
    ai,
    concurrency,
    logger,
    maxChars = MAX_CHARS_PER_BATCH,
    summaries,
  } = req;

  logger.info(
    `[map-reduce] reduceTextSummaries — ${summaries.length} summaries to reduce, concurrency: ${concurrency}`,
  );

  if (summaries.length === 1) {
    logger.info(
      "[map-reduce] reduceTextSummaries — single summary, returning as-is",
    );
    return summaries[0];
  }

  const combined = summaries
    .map((s, i) => `--- Part ${i + 1} ---\n${s}`)
    .join("\n\n");

  logger.info(
    `[map-reduce] reduceTextSummaries — combined length: ${combined.length} chars (limit: ${maxChars})`,
  );

  if (combined.length <= maxChars) {
    const start = Date.now();
    const result = await ai.generateText({
      prompt: `The following are summaries of different parts of a document. Combine them into a single comprehensive summary that captures all key points, main themes, and important details. Remove redundancy and create a cohesive narrative.\n\n${combined}`,
    });
    logger.info(
      `[map-reduce] reduceTextSummaries — final reduce completed in ${Date.now() - start}ms, output: ${result.content.length} chars`,
    );
    return result.content;
  }

  // Summaries themselves are too long — batch and recursively reduce
  const summaryBatches = splitIntoBatchesByChars({
    getLength: (s) => s.length,
    items: summaries,
    maxChars,
  });

  logger.info(
    `[map-reduce] reduceTextSummaries — combined too long, splitting into ${summaryBatches.length} sub-batches for recursive reduce`,
  );

  const tasks = summaryBatches.map((batch, index) => () => {
    const batchText = batch
      .map((s, i) => `--- Part ${i + 1} ---\n${s}`)
      .join("\n\n");
    return summarizeTextBatch({
      ai,
      batchIndex: index,
      logger,
      maxChars,
      text: batchText,
      totalBatches: summaryBatches.length,
    });
  });

  const reducedSummaries = await runWithConcurrency({ concurrency, tasks });
  logger.info(
    `[map-reduce] reduceTextSummaries — recursive reduce: ${summaries.length} → ${reducedSummaries.length} summaries`,
  );
  return reduceTextSummaries({
    ai,
    concurrency,
    logger,
    maxChars,
    summaries: reducedSummaries,
  });
}

/** Partial metadata extracted from a single batch of text. */
export interface PartialUnstructuredMetadata {
  contentDomain: string;
  documentSummary: string;
  entities: Array<{
    count: number;
    name: string;
    type: "date" | "location" | "monetary" | "organisation" | "person";
  }>;
  keyTopics: string[];
}

/**
 * Extract partial metadata (summary, topics, entities, domain) from a single
 * batch of text via AI JSON generation.
 */
export async function extractMetadataBatch(req: {
  ai: AIAdapter;
  batchIndex: number;
  logger: MapReduceLogger;
  maxChars?: number;
  text: string;
  totalBatches: number;
}): Promise<PartialUnstructuredMetadata> {
  const {
    ai,
    batchIndex,
    logger,
    maxChars = MAX_CHARS_PER_BATCH,
    text,
    totalBatches,
  } = req;

  const batchContext =
    totalBatches > 1 ? ` (Part ${batchIndex + 1} of ${totalBatches})` : "";

  logger.info(
    `[map-reduce] extractMetadataBatch ${batchIndex + 1}/${totalBatches} — input: ${text.length} chars`,
  );

  const prompt = `Analyse the following document excerpt${batchContext} and extract metadata. Respond in the same language as the document.

Text:
${text.slice(0, maxChars)}

Respond with a JSON object (no markdown, no code blocks) with exactly this structure:
{
  "documentSummary": "A concise summary of this section",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "contentDomain": "e.g. financial, legal, scientific, general",
  "entities": [
    {"name": "Entity Name", "type": "person|organisation|location|date|monetary", "count": 1}
  ]
}`;

  const start = Date.now();
  const response = await ai.generateJSON({ prompt });
  const latencyMs = Date.now() - start;

  logger.info(
    `[map-reduce] extractMetadataBatch ${batchIndex + 1}/${totalBatches} — completed in ${latencyMs}ms`,
  );

  const data =
    response.data && typeof response.data === "object"
      ? (response.data as Record<string, unknown>)
      : {};

  return {
    contentDomain: (data.contentDomain as string) || "unknown",
    documentSummary: (data.documentSummary as string) || "",
    entities: Array.isArray(data.entities)
      ? (data.entities as PartialUnstructuredMetadata["entities"])
      : [],
    keyTopics: Array.isArray(data.keyTopics)
      ? (data.keyTopics as string[])
      : [],
  };
}

/**
 * Merge multiple partial metadata results into a single combined result.
 * - Summaries are joined with newlines (caller should reduce them separately).
 * - Topics are deduplicated (case-insensitive).
 * - Entities are merged by name+type, summing counts.
 * - Content domain picks the most frequently reported domain.
 */
export function mergePartialMetadata(
  partials: PartialUnstructuredMetadata[],
): PartialUnstructuredMetadata {
  // Merge summaries
  const summaries = partials.map((p) => p.documentSummary).filter(Boolean);
  const documentSummary = summaries.join("\n\n");

  // Deduplicate topics (case-insensitive, keep first casing)
  const topicMap = new Map<string, string>();
  for (const partial of partials) {
    for (const topic of partial.keyTopics) {
      const key = topic.toLowerCase();
      if (!topicMap.has(key)) {
        topicMap.set(key, topic);
      }
    }
  }
  const keyTopics = [...topicMap.values()].sort();

  // Merge entities (by lowercase name + type, sum counts)
  const entityMap = new Map<
    string,
    PartialUnstructuredMetadata["entities"][number]
  >();
  for (const partial of partials) {
    for (const entity of partial.entities) {
      const key = `${entity.name.toLowerCase()}::${entity.type}`;
      const existing = entityMap.get(key);
      if (existing) {
        existing.count += entity.count;
      } else {
        entityMap.set(key, { ...entity });
      }
    }
  }
  const entities = [...entityMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Pick most common domain
  const domainCounts = new Map<string, number>();
  for (const partial of partials) {
    const d = partial.contentDomain.toLowerCase();
    domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
  }
  let contentDomain = "unknown";
  let maxCount = 0;
  for (const [domain, count] of domainCounts) {
    if (count > maxCount) {
      maxCount = count;
      contentDomain = domain;
    }
  }

  return { contentDomain, documentSummary, entities, keyTopics };
}
