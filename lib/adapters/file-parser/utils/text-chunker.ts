/**
 * Text Chunker
 *
 * Uses LangChain's RecursiveCharacterTextSplitter for creating text chunks
 * suitable for vector embeddings. This ensures chunks split at natural
 * boundaries (paragraphs → sentences → words) without cutting mid-sentence.
 *
 * Includes text normalization to join soft-wrapped lines from PDF extraction
 * so that single newlines within paragraphs don't cause mid-sentence splits.
 *
 * Separator priority: paragraph → sentence-ending punctuation → comma → word
 */

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { ParsedTextChunk } from "../types";

/** Default chunk configuration */
const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 200;

/**
 * Separators tuned for natural language documents.
 * Note: single `\n` is intentionally omitted — PDF text often has
 * soft line-wraps mid-sentence. We normalize those to spaces before splitting.
 * Only `\n\n` (paragraph breaks) and sentence punctuation are used.
 */
const SEPARATORS = ["\n\n", ". ", ".\n", "? ", "! ", "; ", ", ", " ", ""];

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
 * Normalize text extracted from PDFs by joining soft-wrapped lines.
 *
 * PDF extractors insert `\n` at the column boundary of the original layout,
 * producing line breaks mid-sentence. This function joins those continuation
 * lines while preserving real paragraph breaks (`\n\n`), section headers,
 * and list items.
 *
 * Preserved as separate lines:
 * - Blank lines / paragraph breaks (`\n\n`)
 * - Lines that end with sentence-ending punctuation (`.`, `!`, `?`)
 * - Lines that end with `:` (headers / labels)
 * - Short lines (≤50 chars — likely headings or metadata)
 * - Lines followed by bullets, numbered lists, or ALL-CAPS headings
 * - Page markers like `-- 1 of 3 --`
 *
 * Everything else is joined with a space (soft-wrap continuation).
 */
export function normalizeExtractedText(text: string): string {
  // Normalize page markers like "-- 1 of 3 --" into paragraph breaks
  const cleaned = text.replace(/\n*--\s*\d+\s*of\s*\d+\s*--\n*/g, "\n\n");

  // Split into paragraphs (separated by blank lines), then process each
  const paragraphs = cleaned.split(/\n{2,}/);
  const processedParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) continue;

    const lines = trimmed.split("\n");
    if (lines.length <= 1) {
      processedParagraphs.push(trimmed);
      continue;
    }

    const joinedLines: string[] = [lines[0].trim()];

    for (let i = 1; i < lines.length; i++) {
      const prevLine = joinedLines[joinedLines.length - 1];
      const currentLine = lines[i].trim();
      if (currentLine.length === 0) continue;

      const shouldKeepBreak = isNaturalBreak(prevLine, currentLine);

      if (shouldKeepBreak) {
        joinedLines.push(currentLine);
      } else {
        // Join continuation line with previous
        joinedLines[joinedLines.length - 1] = `${prevLine} ${currentLine}`;
      }
    }

    processedParagraphs.push(joinedLines.join("\n"));
  }

  return processedParagraphs.join("\n\n").trim();
}

/**
 * Determine if the break between two lines is a natural (intentional) break
 * that should be preserved, vs. a soft-wrap that should be joined.
 */
function isNaturalBreak(prevLine: string, nextLine: string): boolean {
  const trimmedPrev = prevLine.trimEnd();
  const trimmedNext = nextLine.trimStart();

  // Previous line ends with sentence-ending punctuation → natural break
  if (/[.!?]$/.test(trimmedPrev)) return true;

  // Previous line ends with colon (header/label pattern)
  if (trimmedPrev.endsWith(":")) return true;

  // Previous line is short (likely a heading or metadata)
  if (trimmedPrev.length <= 50) return true;

  // Next line starts with a bullet, dash, or numbered list
  if (/^[-•*►]/.test(trimmedNext)) return true;
  if (/^\d+[.)]\s/.test(trimmedNext)) return true;

  // Next line starts with ALL-CAPS word (section heading)
  if (/^[A-Z]{2,}\b/.test(trimmedNext)) return true;

  // Next line is a label (e.g., "Role:", "Team size:", "Responsibilities:")
  if (/^[A-Za-z\s]+:/.test(trimmedNext) && trimmedNext.indexOf(":") < 30)
    return true;

  // Next line starts with a URL
  if (/^https?:\/\//.test(trimmedNext)) return true;

  // Otherwise it's a soft-wrap continuation → join
  return false;
}

/**
 * Split text into chunks using LangChain's RecursiveCharacterTextSplitter.
 *
 * 1. Normalizes the text to join soft-wrapped lines from PDF extraction.
 * 2. Splits using sentence-aware separators so chunks end at natural
 *    boundaries instead of cutting mid-sentence.
 *
 * @param text - The text to split
 * @param options - Chunk configuration options
 * @returns Array of text chunks with metadata
 */
export async function chunkText(
  text: string,
  options: ChunkOptions = {},
): Promise<ParsedTextChunk[]> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  const startIndex = options.startIndex ?? 0;

  if (!text || text.trim().length === 0) return [];

  const normalizedText = normalizeExtractedText(text);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkOverlap: overlap,
    chunkSize,
    separators: SEPARATORS,
  });

  const rawChunks = await splitter.splitText(normalizedText);

  return rawChunks
    .map((content, idx) => ({
      content: content.trim(),
      orderIndex: startIndex + idx,
      sourcePage: options.sourcePage,
    }))
    .filter((chunk) => chunk.content.length > 0);
}
