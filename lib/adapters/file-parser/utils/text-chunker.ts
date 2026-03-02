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
      // Start new chunk with overlap from previous, snapping to word boundary
      if (overlap > 0 && currentChunk.length > 0) {
        const overlapText = snapToWordBoundary(currentChunk, overlap);
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
 * Hard split text at word boundary when no separator works.
 * Finds the nearest space before the chunk boundary to avoid splitting mid-word.
 */
function hardSplit(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // If we're not at the end, find the last space to avoid splitting mid-word
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Compute overlap start, snapping to a word boundary
    const overlapStart = end - overlap;
    if (overlapStart <= start) {
      start = end;
    } else {
      const spaceAfterOverlap = text.indexOf(" ", overlapStart);
      start =
        spaceAfterOverlap > overlapStart && spaceAfterOverlap < end
          ? spaceAfterOverlap + 1
          : overlapStart;
    }

    if (start >= text.length) break;
    // Prevent infinite loop
    if (end === text.length) break;
  }

  return chunks;
}

/**
 * Extract overlap text from the end of a string, snapping to a word boundary.
 * Takes approximately `overlap` characters from the end without splitting a word.
 */
function snapToWordBoundary(text: string, overlap: number): string {
  if (text.length <= overlap) return text;

  const cutPoint = text.length - overlap;
  // Find the next space after the cut point so we start on a whole word
  const spaceIndex = text.indexOf(" ", cutPoint);
  if (spaceIndex !== -1 && spaceIndex < text.length) {
    return text.slice(spaceIndex + 1);
  }
  // No space found — just take the tail (single long word edge case)
  return text.slice(cutPoint);
}
