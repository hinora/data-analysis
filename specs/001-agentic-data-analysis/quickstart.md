# Quickstart: Agentic AI Document Analysis

**Branch**: `001-agentic-data-analysis` | **Date**: 2026-02-26

## Prerequisites

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20 LTS | Runtime |
| npm | 10+ | Package manager (workspaces) |
| PostgreSQL | 16+ | Database |
| Java (JRE) | 8+ | Required for `tabula-js` (PDF table extraction) |
| Ollama | 0.1.26+ | Local AI inference |

## Setup

### 1. Clone and install

```bash
git checkout 001-agentic-data-analysis
npm install
```

### 2. Pull required AI models

```bash
# Chat model (function-calling capable)
ollama pull qwen3:14b

# Embedding model (768 dimensions)
ollama pull nomic-embed-text
```

### 3. Verify Java is available

```bash
java -version
# Requires JRE 8+. Used by tabula-js for PDF table extraction.
```

### 4. Local PostgreSQL setup

This feature runs on **local PostgreSQL** with the **pgvector** extension for vector similarity search.

1. Install and start PostgreSQL 16+ locally (or use Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg16`)
   - The `pgvector/pgvector` Docker image comes with the pgvector extension pre-installed
   - If using a bare PostgreSQL install, install pgvector separately: see https://github.com/pgvector/pgvector#installation
2. Create two databases:
   ```sql
   CREATE DATABASE analysis_db;
   CREATE DATABASE data_db;
   ```
3. Enable the vector extension on `data_db`:
   ```sql
   \c data_db
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. TypeORM migrations will create all tables and indexes automatically on first run

### 5. Scaffold new microservices

```bash
# Analysis microservice (sessions, conversations, chat)
npm run init:microservice -- analysis analysis session,conversation,chat

# Data microservice (upload, datasets, metadata, tools)
npm run init:microservice -- data data upload,dataset,metadata,tools
```

### 6. Configure environment variables

**`apps/domain.analysis/microservice.analysis/.env`**:
```env
NODE_ENV=development
ANALYSIS_DB_URI=postgres://postgres:postgres@localhost:5432/analysis_db
TRANSPORTER=TCP
AI_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:14b
```

**`apps/domain.data/microservice.data/.env`**:
```env
NODE_ENV=development
DATA_DB_URI=postgres://postgres:postgres@localhost:5432/data_db
TRANSPORTER=TCP
AI_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:14b
EMBEDDING_MODEL=nomic-embed-text
MAX_FILE_SIZE_MB=100
UPLOAD_DIR=data/uploads
```

### 7. Install new dependencies

```bash
# Root package.json — add new dependencies
npm install papaparse xlsx pdf-parse tabula-js crypto-js typeorm pg pgvector
npm install -D @types/papaparse
```

### 8. Generate types

```bash
npm run generate:types:all
```

### 9. Start services

```bash
# Terminal 1 — API Gateway (existing)
npm run dev -w microservice.proxy

# Terminal 2 — Analysis microservice
npm run dev -w microservice.analysis

# Terminal 3 — Data microservice
npm run dev -w microservice.data

# Terminal 4 — Frontend
cd frontend && npm run dev
```

## New lib modules

| Module | Path | Purpose |
|--------|------|---------|
| File parser adapters | `lib/adapters/file-parser/` | CSV, PDF, XLSM parsing behind a shared adapter interface |
| Column sanitizer | `lib/adapters/file-parser/utils/column-sanitizer.ts` | Column name sanitization (original → camelCase JSONB key) |
| Text chunker | `lib/adapters/file-parser/utils/text-chunker.ts` | Recursive text chunking for vector embeddings |
| Type inferrer | `lib/adapters/file-parser/utils/type-inferrer.ts` | Automatic data type inference for columns |
| AI tool-calling | `lib/adapters/ai/types.ts` (extended) | `ToolDefinition`, `ToolCall`, `chatWithTools()` types |
| AI embeddings | `lib/adapters/ai/types.ts` (extended) | `generateEmbeddings()` type and adapter method |

## Key patterns

### File parser adapter

```typescript
// lib/adapters/file-parser/types.ts
interface FileParserAdapter {
  parse(params: { buffer: Buffer; filename: string }): Promise<ParseResult>;
  supportedFormats(): string[];
}

interface ParseResult {
  datasets: ParsedDataset[];
  errors: ParseError[];
}
```

### AI tool-calling orchestration loop

```typescript
// apps/domain.analysis/microservice.analysis/services/chat/send.action.ts
// Pseudocode for the orchestration loop (FR-054b):
const MAX_ITERATIONS = 10;
let messages = [systemPrompt, ...history, userMessage];

for (let i = 0; i < MAX_ITERATIONS; i++) {
  const response = await aiAdapter.chatWithTools({ messages, tools });

  if (!response.toolCalls?.length) {
    // Final answer — save and return
    return response.content;
  }

  // Execute each tool via Moleculer action
  for (const toolCall of response.toolCalls) {
    const result = await ctx.call(toolCall.actionName, toolCall.parameters);
    messages.push({ role: "tool", content: JSON.stringify(result) });
  }
}
// Max iterations reached — force partial answer
```

### Background metadata generation (event-driven)

```typescript
// Event flow:
// 1. upload.uploadFile action completes → emits "metadata.generateMetadata" event
// 2. metadata.generateMetadata event handler picks up the event
// 3. Calls AI adapter to generate metadata
// 4. Updates dataset.metadataStatus to "ready" or "failed"
// 5. Emits "dataset.metadataReady" event

// apps/domain.data/microservice.data/services/metadata/generateMetadata.event.ts
export default defineEvent<DatasetImportedPayload>({
  async handler(ctx) {
    const { datasetId, sessionId } = ctx.params;
    // Update status to "in-progress"
    // Generate metadata via AI adapter
    // Log each AI call to AILog (type: "metadata")
    // Update status to "ready" or "failed"
  },
});
```

## Verification checklist

After setup, verify:

- [ ] `ollama list` shows `qwen3:14b` and `nomic-embed-text`
- [ ] `java -version` outputs JRE 8+
- [ ] Local PostgreSQL is running and accessible (`psql -U postgres -d analysis_db` connects)
- [ ] All three microservices start without errors
- [ ] API Gateway routes are accessible at `http://localhost:3000/api/v1/sessions`
- [ ] `npm run generate:types:all` completes without errors
- [ ] `npm run lint` passes
