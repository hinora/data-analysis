# Text Chunking for Vector Database

## Overview

Text extracted from documents (PDFs, etc.) must be split into chunks suitable for vector embeddings stored in PostgreSQL with pgvector. Proper chunking ensures that:

1. Chunks end at **natural boundaries** (sentences, paragraphs) — never mid-sentence
2. Overlapping context between chunks preserves continuity for semantic search
3. Soft line-wraps from PDF layout are normalized before splitting

## Architecture

```mermaid
flowchart LR
    A[PDF Text\nwith soft wraps] --> B[normalizeExtractedText]
    B --> C[Cleaned text\njoined lines]
    C --> D[RecursiveCharacterTextSplitter\n@langchain/textsplitters]
    D --> E[TextChunk[]\nsentence-boundary splits]
    E --> F[(pgvector\n768-dim embeddings)]
```

## Library: `@langchain/textsplitters`

We use LangChain's **`RecursiveCharacterTextSplitter`** — the industry-standard text splitter for RAG pipelines (1.2M+ weekly npm downloads).

**Key advantage over a naive splitter:** When a higher-priority separator (e.g., `\n\n`) produces a chunk that exceeds the target size, it **recursively** applies finer-grained separators (`". "`, `"? "`, `" "`) to that chunk. This guarantees chunks split at the best possible boundary.

### Separator Priority

```
\n\n  →  ". "  →  ".\n"  →  "? "  →  "! "  →  "; "  →  ", "  →  " "  →  ""
```

**Note:** Single `\n` is intentionally excluded from separators. PDF text has soft line-wraps at the column boundary that appear as `\n` mid-sentence. These are normalized to spaces before splitting (see below).

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `chunkSize` | 800 | Target chunk size in characters |
| `overlap` | 200 | Characters of overlap between adjacent chunks |

## Text Normalization (`normalizeExtractedText`)

PDF text extractors insert `\n` at column boundaries, producing line breaks that don't correspond to actual paragraph/sentence breaks. The normalizer joins soft-wrapped continuation lines while preserving intentional breaks.

### Preserved as separate lines

| Pattern | Example | Reason |
|---------|---------|--------|
| Blank lines (`\n\n`) | Between paragraphs | Paragraph breaks |
| Lines ending with `.` `!` `?` | `"...or Docker."` | Complete sentences |
| Lines ending with `:` | `"Role:"`, `"Description:"` | Labels/headers |
| Short lines (≤50 chars) | `"EDUCATION"`, `"Team size: 10"` | Headings/metadata |
| Lines followed by bullets | `"- Agency Revolution"` | List items |
| Lines followed by ALL-CAPS words | `"SKILLS"`, `"GCP"` | Section headings |
| Lines followed by labels with `:` | `"Responsibilities:"` | Field labels |
| Lines followed by URLs | `"https://..."` | Links |
| Page markers | `"-- 1 of 3 --"` | Converted to paragraph breaks |

### Joined with space (continuation)

Any `\n` within a paragraph that doesn't match the above patterns is replaced with a space, joining the soft-wrapped line with the previous one.

## Data Model

Chunks are stored in the `textChunks` table:

| Column | Type | Description |
|--------|------|-------------|
| `content` | text | The chunk text |
| `embedding` | vector(768) | nomic-embed-text embedding |
| `orderIndex` | int | Position in the original document |
| `sourcePage` | int | Source page number (PDFs) |
| `sourceSection` | text | Optional section identifier |
| `datasetId` | uuid | FK to parent Dataset |

## Usage

```typescript
import { chunkText } from "core.lib/adapters/file-parser";

// chunkText is async — uses RecursiveCharacterTextSplitter internally
const chunks = await chunkText(pdfText, {
  chunkSize: 800,
  overlap: 200,
});
// Returns: ParsedTextChunk[] with content, orderIndex, sourcePage
```

## Before vs After

**Before** (custom splitter — cut mid-sentence):
```
Chunk 0: "...I am also well-versed in DevOps, with"  ← CUT
Chunk 1: "in web development. My areas of..."
```

**After** (LangChain RecursiveCharacterTextSplitter — sentence boundary):
```
Chunk 0: "...Next, React, and Moleculer service"  ← splits at ". "
Chunk 1: ". My areas of expertise include..."      ← overlap from previous
```
