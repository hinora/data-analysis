# Research: Agentic AI Document Analysis

**Branch**: `001-agentic-data-analysis` | **Date**: 2026-02-26

## 1. PDF Text Extraction — `pdf-parse`

**Decision**: Use `pdf-parse` (latest stable) for text extraction from PDF files.

**Rationale**: Pure JavaScript/TypeScript, zero native dependencies, cross-platform. Works on Node.js 20 LTS. Handles text-based PDFs reliably; scanned/image PDFs return empty text (OCR is out of scope per spec assumptions). ~2.5M weekly npm downloads.

**Alternatives considered**:
- `pdf2json` — known memory leaks, uncatchable errors
- `pdfjs-dist` (raw Mozilla lib) — lower-level, more integration work
- `unpdf` — wrapper around `pdf-parse`, no added value

**Key implementation notes**:
- Scanned/image-only PDFs produce empty text — the system should detect this and return an informative error (per edge case in spec)
- Extract text page-by-page to preserve page references for `TextChunk.sourcePage`
- Memory: call cleanup after parsing to free resources for large files

---

## 2. PDF Table Extraction — `tabula-js`

**Decision**: Use `tabula-js` as specified in the feature spec. Wrap it behind a file-parser adapter so it can be swapped later.

**Rationale**: The spec explicitly calls for `tabula-js` (FR-017, FR-019). While the library is older (wraps Tabula Java 0.9.0), it produces reliable table extraction and is the standard Node.js approach. The adapter pattern (Constitution Principle IV) means we can swap to a pure-JS alternative later without service code changes.

**Alternatives considered**:
- `pdf-parse` v2 `getTable()` method — promising pure-JS alternative, but v2 API is still maturing. Could be evaluated as a future adapter replacement
- Running `tabula-java` directly via `child_process` — more control over Java version, but same JRE dependency with more boilerplate
- `camelot-py` via subprocess — Python dependency, not viable for a Node.js project

**Key implementation notes**:
- Requires **JRE 8+** installed on the server and `java` on `PATH`
- No TypeScript types available — create a local type declaration file
- Returns empty/minimal CSV for PDFs with no tables (does not throw)
- Spawns a Java child process per extraction (~1–3s startup overhead)
- Use `{ pages: 'all', guess: true }` for automatic table boundary detection
- Implementation must be behind a `FileParserAdapter` interface in `lib/adapters/file-parser/`

---

## 3. XLSM Parsing — `xlsx` (SheetJS)

**Decision**: Use `xlsx` (SheetJS Community Edition, v0.18.5) for XLSM file parsing.

**Rationale**: SheetJS reads XLSM natively (XLSM is XLSX + macros). By default it extracts computed cell values and ignores formulas/macros — exactly what the spec requires. Built-in TypeScript declarations, 6.8M weekly downloads, dominant ecosystem library.

**Alternatives considered**:
- `exceljs` — more modern API but slower for large files, less mature XLSM support, less reliable computed value extraction for macro-heavy files
- Manual ZIP + XML parsing — excessive effort for well-supported format

**Key implementation notes**:
- Read with `XLSX.readFile(path)` or `XLSX.read(buffer, { type: 'buffer' })`
- Iterate sheets via `workbook.SheetNames`
- Convert to JSON: `XLSX.utils.sheet_to_json(ws)` (objects) or `XLSX.utils.sheet_to_json(ws, { header: 1 })` (arrays)
- **Multi-table detection** (FR-015, FR-016): SheetJS does NOT detect multiple tables per sheet. Custom logic required:
  1. Read sheet as array-of-arrays with `{ header: 1 }`
  2. Scan for blank rows (all cells empty/undefined) — these are table boundaries
  3. Scan for blank columns similarly
  4. Split the AOA into sub-regions; first row of each region = headers
  5. Label each table as `"{SheetName} — Table {N}"`
- Cell type `cell.t`: `n` (number), `s` (string), `b` (boolean), `d` (date) — useful for FR-013 type inference
- Set `cellFormula: false` in parse options to explicitly skip formula storage
- License: Apache-2.0

---

## 4. CSV Parsing — `papaparse`

**Decision**: Use `papaparse` (v5.5.x) with `@types/papaparse` for TypeScript support.

**Rationale**: Built-in **auto-detect delimiter** as a first-class feature (activated by default — no config needed). Handles RFC 4180 edge cases (quoted fields, line-breaks within quotes). Provides `result.errors` with per-row error details including row numbers — exactly what FR-020 and FR-021 require. 7.2M weekly downloads.

**Alternatives considered**:
- `csv-parse` (from csv.js) — solid Node.js streaming parser, but **no auto-delimiter detection**; delimiter must be specified
- `fast-csv` — fast but also lacks auto-delimiter detection
- `d3-dsv` — delimiter must be specified

**Key implementation notes**:
```typescript
import Papa from 'papaparse';

const result = Papa.parse(csvString, {
  header: true,           // first row = headers
  dynamicTyping: true,    // auto-convert numbers, booleans
  skipEmptyLines: true,
  // delimiter detection is automatic when not specified
});

// result.data → array of objects
// result.errors → array of { type, code, message, row }
// result.meta.delimiter → detected delimiter character
```
- **Auto-detected delimiters**: comma, tab, pipe, semicolon
- **Error reporting**: `result.errors` contains per-row errors — directly maps to FR-021
- Streaming mode available for large files via `Papa.parse(readableStream, { ... })`
- Install: `npm install papaparse @types/papaparse`

---

## 5. Vector Similarity Search — pgvector on PostgreSQL

**Decision**: Store vector embeddings as a `vector(768)` column on the `textChunks` table using the **pgvector** PostgreSQL extension; query via cosine distance operator `<=>` with an IVFFlat or HNSW index.

**Rationale**: pgvector provides native vector similarity search inside PostgreSQL — no separate vector database, no cloud dependency, runs fully local. Supports cosine, L2, and inner-product distance. HNSW index provides O(log n) approximate nearest neighbour search. Since the project now uses PostgreSQL + TypeORM, embedding storage and vector search happen in the same database as all other data. Pre-filtering by `sessionId` is a simple `WHERE` clause combined with the vector search.

**Alternatives considered**:
- MongoDB Atlas Vector Search — rejected: requires Atlas cloud, not self-hostable
- Application-level cosine similarity (brute-force in Node.js) — works at small scale but O(n) per query; pgvector's indexed search is much faster and offloads work to the database
- Pinecone/Weaviate/Qdrant — separate infrastructure, added operational complexity, overkill for this use case

**Key implementation notes**:

**Extension setup**:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**TypeORM entity pattern**:
```typescript
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from 'typeorm';

@Entity('textChunks')
export class TextChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  datasetId: string;

  @Column('uuid')
  @Index()
  sessionId: string;

  @Column('text')
  content: string;

  @Column({ type: 'int', nullable: true })
  sourcePage: number | null;

  @Column({ type: 'varchar', nullable: true })
  sourceSection: string | null;

  @Column('int')
  orderIndex: number;

  @Column({ type: 'vector', length: 768, nullable: true })
  embedding: string | null;  // pgvector stores as string representation

  @CreateDateColumn()
  createdAt: Date;
}
```

**Vector index** (created via migration):
```sql
CREATE INDEX "idx_textChunks_embedding" ON "textChunks"
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
```

**Query pattern** (TypeORM raw query for vector search):
```typescript
const results = await dataSource.query(
  `SELECT id, content, "sourcePage", "orderIndex",
          1 - (embedding <=> $1::vector) AS score
   FROM "textChunks"
   WHERE "sessionId" = $2
     AND embedding IS NOT NULL
   ORDER BY embedding <=> $1::vector
   LIMIT $3`,
  [pgvectorFormat(queryEmbedding), sessionId, limit]
);

// Helper to format number[] → pgvector string
function pgvectorFormat(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
```

- **Dimensions**: 768 (for `nomic-embed-text`)
- **Pre-filtering**: `WHERE "sessionId" = $2` runs BEFORE vector search — critical for session isolation
- **Runs on local PostgreSQL** with pgvector extension — no cloud dependency
- **Index type**: HNSW (preferred) for fast approximate search; IVFFlat as alternative for lower memory usage
- **Performance**: HNSW index handles millions of vectors; for session-scoped queries (hundreds to thousands of chunks), search is sub-10ms
- **npm package**: `pgvector` npm package provides TypeORM integration helpers for serialisation

---

## 6. AI Function-Calling with Ollama

**Decision**: Use Ollama's native `tools` parameter in the chat API via the `ollama` npm package (already in dependencies).

**Rationale**: Ollama has first-class tool-calling support following an OpenAI-compatible schema. The `qwen3:14b` model (project default) has excellent tool support. The model returns `tool_calls` in responses; tool results are sent back with `role: "tool"`.

**Alternatives considered**:
- Text-based parsing (regex for tool invocations) — fragile, error-prone
- OpenAI-compatible endpoint (`/v1/chat/completions`) — equivalent but native Ollama API gives more control

**Key implementation notes**:

**Tool definition schema** (OpenAI-compatible):
```typescript
const tools = [{
  type: "function",
  function: {
    name: "sumField",
    description: "Calculate the sum of a numeric field",
    parameters: {
      type: "object",
      properties: {
        datasetId: { type: "string", description: "The dataset to query" },
        field: { type: "string", description: "The numeric field to sum" },
      },
      required: ["datasetId", "field"]
    }
  }
}];
```

**Orchestration loop** (FR-054b):
```typescript
let messages = [systemPrompt, ...history, userMessage];
for (let i = 0; i < MAX_ITERATIONS; i++) {
  const response = await client.chat({ model: 'qwen3:14b', messages, tools, stream: false });
  if (!response.message.tool_calls?.length) {
    return response.message.content; // final answer
  }
  messages.push(response.message);
  for (const toolCall of response.message.tool_calls) {
    const result = await broker.call(toolCall.function.name, toolCall.function.arguments);
    messages.push({ role: 'tool', content: JSON.stringify(result) });
  }
}
// Max iterations reached → force partial answer
```

**Supported models with tools**: qwen3 (all sizes), llama3.1/3.2/3.3, mistral-nemo, command-r-plus, deepseek-r1

---

## 7. AI Function-Calling with Gemini

**Decision**: Use `@google/genai` SDK with `functionDeclarations` in the tools config. Tool definitions use the same JSON Schema as Ollama — only the wrapper structure differs.

**Rationale**: Gemini has native function-calling with the same conceptual model (model returns function_call → execute → send back result). Translation from Ollama format to Gemini format is straightforward — the `parameters` object is identical.

**Key implementation notes**:

**Translation pattern** (in the AI adapter):
- Ollama: `tools[].type = "function"`, `tools[].function.{ name, description, parameters }`
- Gemini: `tools[].functionDeclarations[].{ name, description, parameters }`
- The `parameters` JSON Schema object is identical between both providers 
- Adapter layer restructures only the wrapper, not the schema content

**Function calling modes**: `AUTO` (default), `ANY` (force tool use), `NONE` (disable tools)

---

## 8. Text Chunking Strategy

**Decision**: Custom recursive character splitter targeting **800 characters** per chunk with **200 character overlap**. Split on paragraph boundaries first, then sentence boundaries, then word boundaries.

**Rationale**: Balances semantic coherence (each chunk = meaningful context) with retrieval precision (not so large that irrelevant content dilutes the embedding). Overlap ensures boundary content is not lost. Avoids heavy dependencies (LangChain, LlamaIndex) for a straightforward ~50-line utility.

**Alternatives considered**:
- Fixed character splitting — breaks mid-sentence, low quality
- Sentence-level splitting — too small for quality embeddings
- Page-level splitting — too large, dilutes embeddings
- LangChain `RecursiveCharacterTextSplitter` — well-tested but pulls in LangChain dependency

**Key implementation notes**:
- **Target chunk size**: 800 characters (~200 tokens)
- **Overlap**: 200 characters (25% of chunk)
- **Separator priority**: `['\n\n', '\n', '. ', ' ']`
- Each chunk includes `orderIndex` for reconstruction and `sourcePage` for citation
- For `nomic-embed-text` context window (2048 tokens), 800 chars is safely within limits
- Implementation goes in `lib/adapters/file-parser/` as a shared utility

---

## 9. Embedding Generation with Ollama

**Decision**: Use `nomic-embed-text` (v1.5) model via the `ollama` npm package's `embed()` method.

**Rationale**: High-quality embeddings (outperforms OpenAI ada-002 on benchmarks), runs locally via Ollama (no API costs), 768-dimension output balances quality with storage cost. Already compatible with the project's Ollama setup.

**Alternatives considered**:
- `mxbai-embed-large` (1024 dims) — higher quality but larger storage/compute cost, shorter context window (512 tokens)
- `all-minilm` (384 dims) — smaller/faster but lower retrieval quality
- OpenAI `text-embedding-3-small` — cloud-only, costs money

**Key implementation notes**:

| Model | Dimensions | Size | Context Window |
|-------|-----------|------|----------------|
| `nomic-embed-text:v1.5` | **768** | 274 MB | 2048 tokens |
| `mxbai-embed-large` | **1024** | 669 MB | 512 tokens |

**API call**:
```typescript
const response = await ollamaClient.embed({
  model: 'nomic-embed-text',
  input: ['chunk 1 text', 'chunk 2 text'], // batch support
});
// response.embeddings → number[][] (one array per input)
```

- Requires `ollama pull nomic-embed-text` before first use
- Batch multiple chunks in one call for efficiency
- The embedding adapter must follow Constitution Principle IV (adapter pattern, switchable via config)
- Store 768-dimension vectors as `vector(768)` columns in PostgreSQL via pgvector (see Research §5)

---

## 10. Column Name Sanitization

**Decision**: Custom sanitization function — normalize unicode → strip special chars → convert to camelCase → deduplicate → ensure valid identifier. Returns a camelCase key used directly as the JSONB field name in `dataRecords.data`.

**Rationale**: No external library needed (~25 lines). Deterministic output (same input → same output) is critical for the column name mapping (FR-023 through FR-027). No existing library handles all edge cases (unicode, deduplication, reserved names). Since data is stored as JSONB, the sanitized camelCase key is the only identifier — there is no separate database column name.

**Alternatives considered**:
- `lodash.snakeCase` — basic cases only, no unicode handling, no deduplication
- `change-case` — case conversion only, not full sanitization
- `slugify` — designed for URLs, not database column names

**Key implementation notes**:
```typescript
function sanitizeColumnName(name: string, existingNames: Set<string>): string {
  // Step 1: Normalize to lowercase_with_underscores (intermediate)
  let intermediate = name
    .normalize('NFD')                         // decompose unicode
    .replace(/[\u0300-\u036f]/g, '')          // strip diacritical marks
    .replace(/[^\w\s]/g, '')                  // remove non-alphanumeric
    .trim()
    .replace(/\s+/g, '_')                     // spaces → underscores
    .replace(/_+/g, '_')                      // collapse multiple underscores
    .replace(/^_|_$/g, '')                    // trim leading/trailing underscores
    .toLowerCase();
  if (/^\d/.test(intermediate)) intermediate = `col_${intermediate}`;
  if (!intermediate) intermediate = 'unnamed_column';

  // Step 2: Convert to camelCase (final JSONB key)
  let camelCase = intermediate.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

  // Step 3: Deduplicate
  let finalName = camelCase;
  let counter = 1;
  while (existingNames.has(finalName)) {
    finalName = `${camelCase}${counter++}`;
  }
  return finalName; // returns camelCase — used as JSONB key in dataRecords.data
}
```

**Edge cases**:
- All-special-character names → `"unnamedColumn"`
- Duplicate names after sanitization → append `1`, `2`, etc. (e.g., `"salary"`, `"salary1"`)
- Very long names → truncate at 64 characters
- Reserved SQL keywords (`id`, `order`, `group`, `select`, etc.) → prefix with `col` (becomes `colId`, `colOrder`, etc.)

**Column mapping storage**:
```typescript
interface ColumnMapping {
  camelCase: string;           // "employeeFullName" — used as JSONB key
  detectedType: 'boolean' | 'date' | 'number' | 'string';
  order: number;
  original: string;            // "Employee Full Name"
}
```

> **Note**: Since data rows are stored as JSONB in `dataRecords.data`, the sanitized camelCase key is the JSONB field name. There is no separate "database column" name — the camelCase key is queried via `data->>'employeeFullName'`.
