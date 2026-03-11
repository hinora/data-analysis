# Map-Reduce Utilities & Metadata Generation

## Overview

The project uses a **map-reduce** strategy to process documents of any size. The shared utilities in `lib/map-reduce.ts` provide character-aware batching, concurrency control, and metadata extraction pipelines.

These utilities are consumed by:
- **`metadata.generateMetadata`** — extracts unstructured metadata (topics, entities, domain, summary, document index)

## Shared Utilities (`lib/map-reduce.ts`)

| Export | Description |
|--------|-------------|
| `MAX_CHARS_PER_BATCH` | Character limit per batch (12,000) |
| `splitIntoBatchesByChars` | Split items into batches by cumulative character length |
| `runWithConcurrency` | Execute async tasks with a concurrency limit |
| `summarizeTextBatch` | Summarize a single batch of text via `ai.generateText()` |
| `reduceTextSummaries` | Recursively merge multiple summaries into one |
| `extractMetadataBatch` | Extract partial metadata (topics, entities, domain, summary, sections) from a text batch via `ai.generateJSON()` |
| `mergePartialMetadata` | Merge multiple partial metadata results (dedup topics, sum entity counts, pick most common domain, concatenate sections) |

## Unstructured Metadata Generation (`metadata.generateMetadata`)

Uses a map-reduce approach to cover the **entire** document and build comprehensive metadata including a document index.

```mermaid
flowchart TD
    A[Paginated scan: ALL TextChunks with orderIndex] --> B[Split into char-aware batches]
    B --> C1["Batch 1 → AI extractMetadataBatch(chunkStart, chunkEnd)"]
    B --> C2["Batch 2 → AI extractMetadataBatch(chunkStart, chunkEnd)"]
    B --> CN["Batch N → AI extractMetadataBatch(chunkStart, chunkEnd)"]
    C1 --> D[Merge partial metadata]
    C2 --> D
    CN --> D
    D --> E{Multiple batch summaries?}
    E -- Yes --> F["reduceTextSummaries() → single summary"]
    E -- No --> G[Use single summary as-is]
    F --> H[Final UnstructuredMetadata]
    G --> H
    H --> I[Save to dataset.unstructuredMetadata]
```

### Per-Batch Extraction

Each batch produces a `PartialUnstructuredMetadata` with:
- `documentSummary` — summary of that section
- `keyTopics` — topics found in that section
- `contentDomain` — domain classification
- `entities` — named entities with counts (unrestricted types)
- `sections` — logical sections identified within the batch, linked to chunk order index ranges

### Entity Types

Entity types are **not restricted** to predefined categories. The AI is free to use whatever entity type best describes each entity found in the text (e.g. person, organisation, location, date, monetary, product, event, regulation, technology, concept, metric, etc.).

### Document Index

The metadata includes a `documentIndex` — an array of section entries that map logical document sections to chunk order index ranges. Each entry has:
- `title` — section or topic title
- `summary` — brief description of what the section covers
- `chunkStart` — starting chunk orderIndex
- `chunkEnd` — ending chunk orderIndex

This index enables the AI to navigate documents using the `getChunks` tool to read specific sections.

### Merge Strategy (`mergePartialMetadata`)

| Field | Merge Strategy |
|-------|---------------|
| `documentSummary` | Joined, then reduced via `reduceTextSummaries()` into one cohesive summary |
| `keyTopics` | Deduplicated (case-insensitive), sorted alphabetically |
| `entities` | Merged by name+type key, counts summed |
| `contentDomain` | Most frequently reported domain wins |
| `sections` | Concatenated in order (carry chunk index ranges from batches) |
| `wordCount` | Computed from full paginated scan |
| `chunkCount` | Total from DB count query |

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_CHARS_PER_BATCH` | 12,000 | Character limit per batch (map and reduce) |
| `PAGE_SIZE` (metadata) | 100 | DB pagination size for chunk loading |
