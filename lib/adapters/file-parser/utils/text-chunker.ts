/**
 * Text Chunker
 *
 * Recursive character splitter for creating text chunks suitable for
 * vector embeddings. Targets ~800 chars per chunk with 200-char overlap.
 *
 * Separator priority: paragraph → newline → sentence → word
 */

import type { ParsedTextChunk } from "../types";

/** Default chunk configuration */
const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 200;
const SEPARATORS = ["\n\n", "\n", ". ", " "];

export interface ChunkOptions {
  /** Target chunk size in characters (default: 800) */
  chunkSize?: number;
  /** Overlap between chunks in characters (default: 200) */
  overlap?: number;
  /** Source page number (1-based, for PDFs) */
  sourcePage?: number;
  /** Starting order index (default: 0) */
  startIndex?: number;
}

/**
 * Split text into chunks using recursive character splitting
 *
 * @param text - The text to split
 * @param options - Chunk configuration options
 * @returns Array of text chunks with metadata
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {},
): ParsedTextChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  const startIndex = options.startIndex ?? 0;

  if (!text || text.trim().length === 0) return [];

  const rawChunks = recursiveSplit(text, chunkSize, overlap, SEPARATORS);
  return rawChunks.map((content, idx) => ({
    content,
    orderIndex: startIndex + idx,
    sourcePage: options.sourcePage,
  }));
}

/**
 * Recursively split text using separator priority
 */
function recursiveSplit(
  text: string,
  chunkSize: number,
  overlap: number,
  separators: string[],
): string[] {
  if (text.length <= chunkSize) {
    return [text.trim()].filter((t) => t.length > 0);
  }

  // Try each separator in priority order
  for (const sep of separators) {
    const parts = text.split(sep);
    if (parts.length <= 1) continue;

    return mergeChunks(parts, sep, chunkSize, overlap);
  }

  // Fallback: hard split at chunkSize
  return hardSplit(text, chunkSize, overlap);
}

/**
 * Merge split parts back into chunks of target size
 */
function mergeChunks(
  parts: string[],
  separator: string,
  chunkSize: number,
  overlap: number,
): string[] {
  const chunks: string[] = [];
  let currentChunk = "";

  for (const part of parts) {
    const candidate = currentChunk
      ? `${currentChunk}${separator}${part}`
      : part;

    if (candidate.length <= chunkSize) {
      currentChunk = candidate;
    } else {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      // Start new chunk with overlap from previous
      if (overlap > 0 && currentChunk.length > 0) {
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = `${overlapText}${separator}${part}`;
      } else {
        currentChunk = part;
      }

      // If single part exceeds chunk size, force-add it
      if (currentChunk.length > chunkSize * 2) {
        const forced = hardSplit(currentChunk, chunkSize, overlap);
        chunks.push(...forced.slice(0, -1));
        currentChunk = forced[forced.length - 1] || "";
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Hard split text at character boundary when no separator works
 */
function hardSplit(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    start = end - overlap;
    if (start >= text.length) break;
    // Prevent infinite loop
    if (end === text.length) break;
  }

  return chunks;
}
