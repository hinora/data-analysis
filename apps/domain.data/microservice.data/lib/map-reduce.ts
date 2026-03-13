/**
 * Map-Reduce Utilities
 *
 * Shared batching and concurrency helpers used by:
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

/**
 * Generate AI summaries for a batch of text chunks.
 * Processes chunks in groups, sending multiple chunks per AI call for efficiency.
 * Returns a Map of chunk ID → summary string.
 */
export async function generateChunkSummaries(req: {
  ai: AIAdapter;
  chunks: Array<{ content: string; id: string; orderIndex: number }>;
  groupSize?: number;
  logger: MapReduceLogger;
}): Promise<Map<string, string>> {
  const { ai, chunks, groupSize = 5, logger } = req;
  const summaries = new Map<string, string>();

  if (chunks.length === 0) return summaries;

  logger.info(
    `[map-reduce] generateChunkSummaries — ${chunks.length} chunks in groups of ${groupSize}`,
  );

  for (let i = 0; i < chunks.length; i += groupSize) {
    const batch = chunks.slice(i, i + groupSize);

    const prompt = `Summarize each of the following text chunks in 1-2 concise sentences. Respond in the same language as the text. Respond with a JSON array of summary strings in the same order as the chunks (no markdown, no code blocks).

${batch.map((c, idx) => `--- Chunk ${idx + 1} (index ${c.orderIndex}) ---\n${c.content.slice(0, 2000)}`).join("\n\n")}

Respond with a JSON array: ["summary for chunk 1", "summary for chunk 2", ...]`;

    const start = Date.now();
    const response = await ai.generateJSON({ prompt });
    const latencyMs = Date.now() - start;

    const data = Array.isArray(response.data) ? response.data : [];

    for (let j = 0; j < batch.length; j++) {
      const summary = typeof data[j] === "string" ? data[j] : "";
      summaries.set(batch[j].id, summary);
    }

    logger.info(
      `[map-reduce] generateChunkSummaries — batch ${Math.floor(i / groupSize) + 1}/${Math.ceil(chunks.length / groupSize)} done (${latencyMs}ms)`,
    );
  }

  return summaries;
}

/** Partial metadata extracted from a single batch of text. */
export interface PartialUnstructuredMetadata {
  contentDomain: string;
  documentSummary: string;
  entities: Array<{
    count: number;
    name: string;
    type: string;
  }>;
  keyTopics: string[];
  sections: Array<{
    chunkEnd: number;
    chunkStart: number;
    level: number;
    summary: string;
    title: string;
  }>;
}

/**
 * Extract partial metadata (summary, topics, entities, domain, sections) from a single
 * batch of text via AI JSON generation. Accepts chunk index range to build document index.
 */
export async function extractMetadataBatch(req: {
  ai: AIAdapter;
  batchIndex: number;
  chunkEndIndex: number;
  chunkStartIndex: number;
  logger: MapReduceLogger;
  maxChars?: number;
  text: string;
  totalBatches: number;
}): Promise<PartialUnstructuredMetadata> {
  const {
    ai,
    batchIndex,
    chunkEndIndex,
    chunkStartIndex,
    logger,
    maxChars = MAX_CHARS_PER_BATCH,
    text,
    totalBatches,
  } = req;

  const batchContext =
    totalBatches > 1 ? ` (Part ${batchIndex + 1} of ${totalBatches})` : "";

  logger.info(
    `[map-reduce] extractMetadataBatch ${batchIndex + 1}/${totalBatches} — input: ${text.length} chars, chunks ${chunkStartIndex}–${chunkEndIndex}`,
  );

  const prompt = `Analyse the following document excerpt${batchContext} and extract metadata. Respond in the same language as the document.
This excerpt covers chunks indexed from ${chunkStartIndex} to ${chunkEndIndex}.

Text:
${text.slice(0, maxChars)}

Respond with a JSON object (no markdown, no code blocks) with exactly this structure:
{
  "documentSummary": "A concise summary of this section",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "contentDomain": "e.g. financial, legal, scientific, general",
  "entities": [
    {"name": "Entity Name", "type": "any relevant type, e.g. person, organisation, location, date, monetary, product, event, regulation, technology, etc.", "count": 1}
  ],
  "sections": [
    {"title": "Main Section Title", "summary": "Brief description", "chunkStart": ${chunkStartIndex}, "chunkEnd": ${chunkEndIndex}, "level": 0},
    {"title": "Sub Section Title", "summary": "Brief description of sub-section", "chunkStart": ${chunkStartIndex}, "chunkEnd": ${chunkEndIndex}, "level": 1}
  ]
}

For "entities", extract ALL relevant entities found in the text. Do not restrict to predefined types — use whatever entity type best describes each entity (e.g. person, organisation, location, date, monetary, product, event, regulation, technology, concept, metric, etc.).

For "sections", identify logical sections and sub-sections within this excerpt, like a book's table of contents with multiple levels. Use the "level" field to indicate depth: 0 for main sections, 1 for sub-sections, 2 for sub-sub-sections, etc. Each section should reference the chunk index range it covers (between ${chunkStartIndex} and ${chunkEndIndex}). List sections in document order, with sub-sections appearing right after their parent section. If the excerpt covers a single topic, return one section at level 0 spanning the full range.`;

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

  const rawSections = Array.isArray(data.sections)
    ? (data.sections as Array<Record<string, unknown>>)
    : [];

  const sections = rawSections
    .filter((s) => s.title && typeof s.title === "string")
    .map((s) => ({
      chunkEnd: Math.min(Number(s.chunkEnd ?? chunkEndIndex), chunkEndIndex),
      chunkStart: Math.max(
        Number(s.chunkStart ?? chunkStartIndex),
        chunkStartIndex,
      ),
      level: Math.max(0, Math.floor(Number(s.level ?? 0))),
      summary: String(s.summary || ""),
      title: String(s.title),
    }));

  return {
    contentDomain: (data.contentDomain as string) || "unknown",
    documentSummary: (data.documentSummary as string) || "",
    entities: Array.isArray(data.entities)
      ? (data.entities as PartialUnstructuredMetadata["entities"])
      : [],
    keyTopics: Array.isArray(data.keyTopics)
      ? (data.keyTopics as string[])
      : [],
    sections:
      sections.length > 0
        ? sections
        : [
            {
              chunkEnd: chunkEndIndex,
              chunkStart: chunkStartIndex,
              level: 0,
              summary: (data.documentSummary as string) || "",
              title: `Part ${batchIndex + 1}`,
            },
          ],
  };
}

/**
 * Merge multiple partial metadata results into a single combined result.
 * - Summaries are joined with newlines (caller should reduce them separately).
 * - Topics are deduplicated (case-insensitive).
 * - Entities are merged by name+type, summing counts.
 * - Content domain picks the most frequently reported domain.
 * - Sections are concatenated in order (already carry chunk index ranges).
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

  // Concatenate sections in order (they already carry chunk index ranges)
  const sections: PartialUnstructuredMetadata["sections"] = [];
  for (const partial of partials) {
    sections.push(...(partial.sections || []));
  }

  return { contentDomain, documentSummary, entities, keyTopics, sections };
}

/**
 * Assign hierarchical index labels to a flat list of sections based on their level.
 * Produces book-style labels: "1", "2", "2a", "2b", "3", "3a", "3a-i", etc.
 *
 * - Level 0: numeric (1, 2, 3, ...)
 * - Level 1: parent number + lowercase letter (1a, 1b, 2a, ...)
 * - Level 2: parent label + roman numeral (1a-i, 1a-ii, ...)
 * - Level 3+: parent label + sequential number (1a-i-1, 1a-i-2, ...)
 */
export function assignIndexLabels(
  sections: Array<{ level: number }>,
): string[] {
  const labels: string[] = [];
  // Track current counter at each level
  const counters: number[] = [];
  // Track the label of the parent at each level
  const parentLabels: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const level = sections[i].level;

    // Reset counters for all deeper levels when we encounter a section
    counters.length = Math.max(counters.length, level + 1);
    for (let l = level + 1; l < counters.length; l++) {
      counters[l] = 0;
    }

    // Initialize counter for this level if needed
    if (counters[level] === undefined) {
      counters[level] = 0;
    }
    counters[level]++;

    let label: string;
    if (level === 0) {
      label = String(counters[level]);
    } else {
      const parent = parentLabels[level - 1] || String(counters[0] || 1);
      const index = counters[level];
      if (level === 1) {
        label = `${parent}${toLowerAlpha(index)}`;
      } else if (level === 2) {
        label = `${parent}-${toRoman(index)}`;
      } else {
        label = `${parent}-${index}`;
      }
    }

    labels.push(label);
    parentLabels[level] = label;
  }

  return labels;
}

function toLowerAlpha(n: number): string {
  if (n <= 0) return "a";
  // 1 → a, 2 → b, ..., 26 → z, 27 → aa, ...
  let result = "";
  let num = n;
  while (num > 0) {
    num--;
    result = String.fromCharCode(97 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

function toRoman(n: number): string {
  if (n <= 0) return "i";
  const numerals: [number, string][] = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let result = "";
  let remaining = n;
  for (const [value, numeral] of numerals) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
}
