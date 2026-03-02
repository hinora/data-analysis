# Data Model: Agentic AI Document Analysis

**Branch**: `001-agentic-data-analysis` | **Date**: 2026-02-27

**Database**: PostgreSQL 16+ with pgvector extension | **ORM**: TypeORM

## Entity Overview

```
Session ──< Conversation ──< ChatMessage    (system/user/assistant messages)
   │                └──< AILog              (AI audit for chat interactions)
   │
   └──(cross-service ref)──< Dataset ──< DataRecord    (structured data rows)
                                │──< TextChunk         (unstructured text + embeddings)
                                │──< AILog             (AI audit for metadata generation)
                                └──< OriginalFile      (raw uploaded file)
```

**Database ownership**:
- `microservice.analysis` → `analysis_db`: Session, Conversation, ChatMessage, AILog (type: `"chat"`)
- `microservice.data` → `data_db`: Dataset, DataRecord, TextChunk, OriginalFile, AILog (type: `"metadata"`)

Each microservice connects to its own PostgreSQL database. Both databases run on the same PostgreSQL server in development (`localhost:5432`).

---

## Entities

### Session

**Database**: `analysis_db` | **Table**: `sessions` | **Microservice**: `microservice.analysis`

Represents an isolated analysis workspace containing datasets and conversations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Primary key |
| `name` | `varchar(200)` | NOT NULL | User-provided or auto-generated (e.g., "Session — Feb 25, 2026 14:30") |
| `status` | `enum('empty','has-data','active','archived')` | NOT NULL, default `'empty'` | Session lifecycle status |
| `datasetCount` | `integer` | NOT NULL, default `0` | Denormalized count of datasets in this session |
| `conversationCount` | `integer` | NOT NULL, default `0` | Denormalized count of conversations |
| `createdAt` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |
| `updatedAt` | `timestamptz` | NOT NULL, default `now()` | Last update (serves as "last activity date") |

**Indexes**:
- `idx_sessions_createdAt` on `("createdAt" DESC)` — session listing sorted by creation date

**Validation rules**:
- `name`: min 1 char, max 200 chars
- `status`: must be one of the enum values
- Auto-generated name format: `"Session — {MMM DD, YYYY HH:mm}"`

**State transitions**:
```
empty → has-data    (when first dataset is imported)
has-data → active   (when first conversation is created)
active → active     (remains active while in use)
any → archived      (future: manual archive)
```

---

### Dataset

**Database**: `data_db` | **Table**: `datasets` | **Microservice**: `microservice.data`

A single detected table or text block from an imported file.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Primary key |
| `sessionId` | `uuid` | NOT NULL | Reference to parent Session (cross-service, not FK) |
| `originalFileId` | `uuid` | NOT NULL, FK → `originalFiles.id` | Reference to the uploaded OriginalFile |
| `name` | `varchar(500)` | NOT NULL | Display name (e.g., "Sheet1 — Table 1", "Report Text") |
| `fileType` | `enum('csv','pdf','xlsm')` | NOT NULL | Source file format |
| `datasetType` | `enum('structured-table','unstructured-text')` | NOT NULL | Nature of the data |
| `metadataStatus` | `enum('pending','in-progress','ready','failed')` | NOT NULL, default `'pending'` | AI metadata generation status |
| `rowCount` | `integer` | NOT NULL | Number of rows (structured) or chunks (unstructured) |
| `columnCount` | `integer` | nullable | Number of columns (structured only; null for unstructured) |
| `columnMappings` | `jsonb` | nullable | Column name mappings as `ColumnMapping[]` (structured only) |
| `sheetName` | `varchar(200)` | nullable | XLSM sheet name (XLSM only) |
| `tablePosition` | `integer` | nullable | Table position within a sheet (XLSM multi-table only) |
| `sourceFileHash` | `varchar(64)` | NOT NULL | SHA-256 hash of the original file |
| `importedAt` | `timestamptz` | NOT NULL | Timestamp of import completion |
| `structuredMetadata` | `jsonb` | nullable | AI-generated metadata for structured datasets |
| `unstructuredMetadata` | `jsonb` | nullable | AI-generated metadata for unstructured datasets |
| `relationships` | `jsonb` | nullable | Detected relationships with other datasets |
| `createdAt` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |
| `updatedAt` | `timestamptz` | NOT NULL, default `now()` | Update timestamp |

**Indexes**:
- `idx_datasets_sessionId_createdAt` on `("sessionId", "createdAt" DESC)` — datasets per session
- `idx_datasets_sessionId_sourceFileHash` on `("sessionId", "sourceFileHash")` UNIQUE — duplicate detection

**JSONB sub-document types**:

```typescript
interface ColumnMapping {
  camelCase: string;            // "employeeFullName" — used as JSONB key in dataRecords.data
  detectedType: "boolean" | "date" | "number" | "string";
  order: number;                // column position (0-based)
  original: string;             // "Employee Full Name"
}

interface StructuredMetadata {
  columnDescriptions: Array<{
    columnKey: string;        // camelCase JSONB key (e.g., "employeeFullName")
    columnOriginal: string;   // original column name
    description: string;      // AI-generated description
    exampleValues: string[];  // first 3-5 example values
  }>;
  datasetDescription: string;  // overall AI-generated description
  statistics: Array<{
    columnKey: string;          // camelCase JSONB key
    // Numeric columns
    average?: number;
    max?: number;
    min?: number;
    nullCount: number;
    // Categorical columns
    topFrequentValues?: Array<{ count: number; value: string }>;
    uniqueCount?: number;
  }>;
}

interface UnstructuredMetadata {
  chunkCount: number;
  contentDomain: string;         // e.g., "legal", "financial", "scientific"
  documentSummary: string;
  entities: Array<{
    count: number;
    name: string;
    type: "date" | "location" | "monetary" | "organisation" | "person";
  }>;
  keyTopics: string[];
  wordCount: number;
}

interface RelationshipSuggestion {
  relatedDatasetId: string;     // UUID
  relatedDatasetName: string;
  relationshipType: "shared-column" | "shared-entity" | "shared-topic";
  sharedFields?: string[];      // for structured: shared column names
  description: string;          // AI-generated explanation
}
```

---

### DataRecord

**Database**: `data_db` | **Table**: `dataRecords` | **Microservice**: `microservice.data`

Individual rows parsed from a structured table dataset. Stored as **schemaless JSONB** — each record contains the row data as key-value pairs using camelCase column keys.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Primary key |
| `datasetId` | `uuid` | NOT NULL, FK → `datasets.id` ON DELETE CASCADE | Reference to parent Dataset |
| `sessionId` | `uuid` | NOT NULL | Reference to parent Session (denormalized for query efficiency) |
| `data` | `jsonb` | NOT NULL | Schemaless object: `{ "columnName": value, ... }` using camelCase keys from columnMappings |

**Indexes**:
- `idx_dataRecords_datasetId` on `("datasetId")` — all records for a dataset
- `idx_dataRecords_sessionId_datasetId` on `("sessionId", "datasetId")` — session-scoped queries

**Design notes**:
- The `data` column uses `jsonb` (schemaless). The Dataset's `columnMappings` serves as the structural reference — it is NOT enforced at the database level.
- Values preserve original precision: numbers stored as-is, dates stored as ISO strings per source format.
- Records are bulk-inserted after parsing for performance (TypeORM `createQueryBuilder().insert().values([...]).execute()`).
- PostgreSQL JSONB supports indexing on specific keys via GIN indexes if query patterns demand it later.

**JSONB querying** (how tools query data stored in the `data` column):

All structured data tools (sumField, avgField, filterByCondition, aggregate, etc.) query the JSONB `data` column using PostgreSQL's native JSONB operators. This is fully supported and performant:

```sql
-- Sum a numeric field stored in JSONB
SELECT SUM((data->>'salary')::numeric) FROM "dataRecords"
  WHERE "datasetId" = $1;

-- Average with groupBy
SELECT data->>'department' AS department,
       AVG((data->>'salary')::numeric) AS avg_salary
FROM "dataRecords" WHERE "datasetId" = $1
GROUP BY data->>'department';

-- Filter by condition (equals)
SELECT data FROM "dataRecords"
  WHERE "datasetId" = $1 AND data->>'status' = 'active';

-- Filter by numeric range
SELECT data FROM "dataRecords"
  WHERE "datasetId" = $1
    AND (data->>'salary')::numeric BETWEEN 50000 AND 100000;

-- Count distinct values
SELECT data->>'department' AS value, COUNT(*) AS count
FROM "dataRecords" WHERE "datasetId" = $1
GROUP BY data->>'department';

-- Top N by field
SELECT data FROM "dataRecords"
  WHERE "datasetId" = $1
  ORDER BY (data->>'revenue')::numeric DESC LIMIT 10;

-- Get min/max
SELECT MIN((data->>'price')::numeric), MAX((data->>'price')::numeric)
FROM "dataRecords" WHERE "datasetId" = $1;
```

Key JSONB operators:
- `data->>'key'` — extract value as text
- `(data->>'key')::numeric` — cast to numeric for aggregation
- `(data->>'key')::timestamptz` — cast to timestamp for date operations
- `data @> '{"key": "value"}'::jsonb` — containment check (uses GIN index)
- `data ? 'key'` — check if key exists

TypeORM integration: tools use `createQueryBuilder()` with `.select()` and raw SQL fragments for JSONB access, or `dataSource.query()` for complex aggregations.

---

### TextChunk

**Database**: `data_db` | **Table**: `textChunks` | **Microservice**: `microservice.data`

A segment of unstructured text from a PDF or non-tabular content, with vector embedding for semantic search.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Primary key |
| `datasetId` | `uuid` | NOT NULL, FK → `datasets.id` ON DELETE CASCADE | Reference to parent Dataset |
| `sessionId` | `uuid` | NOT NULL | Reference to parent Session (denormalized for vector search pre-filter) |
| `content` | `text` | NOT NULL | The text content of this chunk |
| `sourcePage` | `integer` | nullable | Page number in the source PDF (1-based) |
| `sourceSection` | `varchar(500)` | nullable | Section reference (if detectable) |
| `orderIndex` | `integer` | NOT NULL | Position of this chunk in the document (0-based) |
| `embedding` | `vector(768)` | nullable | 768-dimensional vector embedding (nomic-embed-text) via pgvector |
| `createdAt` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |

**Indexes**:
- `idx_textChunks_datasetId_orderIndex` on `("datasetId", "orderIndex")` — ordered chunks per dataset
- `idx_textChunks_sessionId` on `("sessionId")` — session-scoped queries
- `idx_textChunks_embedding` HNSW index on `(embedding vector_cosine_ops)` WHERE `embedding IS NOT NULL` — pgvector similarity search

**Design notes**:
- Chunks target ~800 characters with 200-char overlap (see research.md §8)
- Embeddings are generated via `nomic-embed-text` (768 dimensions) using the AI adapter
- The `embedding` column uses pgvector's `vector(768)` type with an HNSW index for fast approximate nearest-neighbour cosine search
- **Vector search approach**: Native pgvector `<=>` (cosine distance) operator with HNSW index. Pre-filtered by `sessionId` via `WHERE` clause. Runs on local PostgreSQL — no cloud dependency. See research.md §5 for implementation details
- Session isolation is achieved via `WHERE "sessionId" = $1` in the vector search query

---

### OriginalFile

**Database**: `data_db` | **Table**: `originalFiles` | **Microservice**: `microservice.data`

The raw uploaded file stored for provenance (Constitution Principle II).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Primary key |
| `sessionId` | `uuid` | NOT NULL | Reference to parent Session |
| `filename` | `varchar(500)` | NOT NULL | Original filename as uploaded |
| `mimeType` | `varchar(100)` | NOT NULL | MIME type (e.g., `application/pdf`, `text/csv`) |
| `fileSize` | `bigint` | NOT NULL | File size in bytes |
| `fileHash` | `varchar(64)` | NOT NULL | SHA-256 hash of file content |
| `storagePath` | `varchar(1000)` | NOT NULL | Path to file on local filesystem |
| `createdAt` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |

**Indexes**:
- `idx_originalFiles_sessionId` on `("sessionId")` — files per session
- `idx_originalFiles_sessionId_fileHash` on `("sessionId", "fileHash")` UNIQUE — duplicate detection

**Design notes**:
- Files stored at: `data/uploads/{sessionId}/{fileHash}-{originalFilename}`
- One OriginalFile may produce multiple Datasets (e.g., XLSM with 3 sheets × 2 tables = 6 datasets)
- Deletion cascades: deleting an OriginalFile also deletes its Datasets (via FK CASCADE), which cascades to DataRecords and TextChunks

---

### Conversation

**Database**: `analysis_db` | **Table**: `conversations` | **Microservice**: `microservice.analysis`

A single chat thread within a session.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Primary key |
| `sessionId` | `uuid` | NOT NULL, FK → `sessions.id` ON DELETE CASCADE | Reference to parent Session |
| `name` | `varchar(500)` | NOT NULL | User-provided or auto-generated (e.g., "Conversation — Feb 26, 14:00") |
| `systemPrompt` | `text` | NOT NULL | Full system prompt constructed at creation time |
| `messageCount` | `integer` | NOT NULL, default `0` | Denormalized message count |
| `createdAt` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |
| `updatedAt` | `timestamptz` | NOT NULL, default `now()` | Last update (serves as "last activity") |

**Indexes**:
- `idx_conversations_sessionId_createdAt` on `("sessionId", "createdAt" DESC)` — conversations per session

**Design notes**:
- `systemPrompt` is constructed from session state at creation time and NEVER updated afterward (FR-073, FR-074)
- System prompt is persisted as the first ChatMessage (role: "system") AND stored on the Conversation for easy access
- If session data changes after conversation creation, only new conversations pick up the changes

---

### ChatMessage

**Database**: `analysis_db` | **Table**: `chatMessages` | **Microservice**: `microservice.analysis`

A single message in a conversation thread.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Primary key |
| `conversationId` | `uuid` | NOT NULL, FK → `conversations.id` ON DELETE CASCADE | Reference to parent Conversation |
| `sessionId` | `uuid` | NOT NULL | Denormalized for efficient queries |
| `role` | `enum('system','user','assistant')` | NOT NULL | Message sender role |
| `content` | `text` | NOT NULL | Message text content |
| `confidenceScore` | `real` | nullable | 0–1 confidence score (assistant only) |
| `citedSources` | `jsonb` | nullable | Data sources cited as `CitedSource[]` (assistant only) |
| `toolsUsed` | `jsonb` | nullable | Tools invoked as `ToolUsage[]` (assistant only) |
| `reasoningSteps` | `jsonb` | nullable | Reasoning steps as `string[]` (assistant only) |
| `createdAt` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |

**Indexes**:
- `idx_chatMessages_conversationId_createdAt` on `("conversationId", "createdAt" ASC)` — messages in order for a conversation
- `idx_chatMessages_sessionId` on `("sessionId")` — session-level queries

**JSONB sub-document types**:

```typescript
interface CitedSource {
  columnName?: string;        // specific column referenced
  datasetId: string;          // UUID
  datasetName: string;
}

interface ToolUsage {
  parameters: Record<string, unknown>;
  resultSummary: string;      // brief summary of tool output
  toolName: string;
}
```

---

### AILog

**Database**: `analysis_db` + `data_db` | **Table**: `aiLogs` | **Microservice**: Both

Unified audit record for every AI interaction (Constitution Principle III & VI). Both microservices maintain their own `aiLogs` table using a shared TypeORM entity defined in `lib/`. The `type` column distinguishes chat interactions from metadata-generation interactions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Primary key |
| `type` | `enum('chat','metadata')` | NOT NULL | Log category |
| `sessionId` | `uuid` | NOT NULL | Reference to parent Session |
| `conversationId` | `uuid` | nullable | Chat only: reference to the Conversation |
| `messageId` | `uuid` | nullable | Chat only: reference to the resulting ChatMessage |
| `datasetId` | `uuid` | nullable | Metadata only: reference to the Dataset being analysed |
| `purpose` | `enum('structured-metadata','unstructured-metadata','relationship-detection','embedding-generation')` | nullable | Metadata only |
| `promptSent` | `text` | NOT NULL | Full prompt sent to the AI provider |
| `responseReceived` | `text` | NOT NULL | Full AI response received |
| `model` | `varchar(100)` | NOT NULL | Model identifier (e.g., "qwen3:14b", "nomic-embed-text") |
| `provider` | `varchar(50)` | NOT NULL | Provider identifier (e.g., "ollama", "gemini") |
| `promptTokens` | `integer` | NOT NULL | Tokens used for the prompt |
| `completionTokens` | `integer` | NOT NULL | Tokens used for the completion |
| `totalTokens` | `integer` | NOT NULL | Total tokens used |
| `latencyMs` | `integer` | NOT NULL | Processing time in milliseconds |
| `toolCalls` | `jsonb` | nullable | Chat only: sequence of tool calls in the orchestration loop |
| `iterationCount` | `integer` | nullable | Chat only: number of orchestration loop iterations |
| `confidenceScore` | `real` | nullable | Chat only: final confidence score |
| `status` | `enum('success','failed')` | nullable | Metadata only |
| `errorMessage` | `text` | nullable | Metadata only: error details if status is "failed" |
| `createdAt` | `timestamptz` | NOT NULL, default `now()` | Creation timestamp |

**Indexes** (per table instance):
- `idx_aiLogs_type_sessionId_createdAt` on `(type, "sessionId", "createdAt" DESC)` — type-scoped session queries
- `idx_aiLogs_conversationId_createdAt` on `("conversationId", "createdAt" DESC)` WHERE `"conversationId" IS NOT NULL` — chat logs per conversation (`analysis_db`)
- `idx_aiLogs_datasetId_createdAt` on `("datasetId", "createdAt" DESC)` WHERE `"datasetId" IS NOT NULL` — metadata logs per dataset (`data_db`)
- `idx_aiLogs_status_createdAt` on `(status, "createdAt" DESC)` WHERE `status IS NOT NULL` — find failed metadata generations (`data_db`)

**JSONB sub-document types**:

```typescript
interface ToolCallLog {
  durationMs: number;
  iterationIndex: number;
  parameters: Record<string, unknown>;
  resultSummary: string;
  toolName: string;
}
```

**Design notes**:
- **Shared entity**: Both `analysis_db.aiLogs` and `data_db.aiLogs` use the same TypeORM entity class defined in `lib/database/`. Each microservice's data source creates the table in its own database.
- **Chat type** (`analysis_db`): `conversationId` and `messageId` are required; `toolCalls`, `iterationCount`, `confidenceScore` are populated. `datasetId`, `purpose`, `status`, `errorMessage` are null.
- **Metadata type** (`data_db`): `datasetId` and `purpose` are required; `status` distinguishes success/failure. `conversationId`, `messageId`, `toolCalls`, `iterationCount`, `confidenceScore` are null.
- One metadata generation run may produce **multiple** AILog entries (e.g., one for column descriptions, one for statistics, one for relationship detection)
- For embedding generation, `promptSent` stores the chunk count and model used; `responseReceived` stores the dimension count and total chunks embedded
- Failed logs preserve error context so failures can be diagnosed without additional investigation (Constitution Principle VI)
- When metadata generation is retried, new AILog entries are appended (old entries are not deleted, preserving retry history)

---

## Cross-Entity Relationships

| Relationship | Type | Cascade on Delete |
|-------------|------|-------------------|
| Session → Dataset | 1:N (cross-service via sessionId) | Deleting a Session triggers event to delete all Datasets, DataRecords, TextChunks, OriginalFiles, AILogs (metadata type) |
| Session → Conversation | 1:N (FK CASCADE) | Deleting a Session deletes all Conversations, ChatMessages, AILogs (chat type) |
| Dataset → DataRecord | 1:N (FK CASCADE) | Deleting a Dataset deletes all child DataRecords |
| Dataset → TextChunk | 1:N (FK CASCADE) | Deleting a Dataset deletes all child TextChunks |
| Dataset → AILog | 1:N | Deleting a Dataset deletes all child AILogs (metadata type) via application code |
| OriginalFile → Dataset | 1:N (FK) | Deleting an OriginalFile deletes all child Datasets (cascade via application code) |
| Conversation → ChatMessage | 1:N (FK CASCADE) | Deleting a Conversation deletes all child ChatMessages |
| Conversation → AILog | 1:N | Deleting a Conversation deletes all child AILogs (chat type) via application code |

**Cross-service deletion**: Session lives in `microservice.analysis` (`analysis_db`); Datasets live in `microservice.data` (`data_db`). Since they are in separate PostgreSQL databases, there is no direct FK. Deleting a session emits a `session.deleted` event that `microservice.data` listens to and cascades deletion of Datasets, DataRecords, TextChunks, OriginalFiles, and AILogs (metadata type).

**Within-service cascading**: Within the same database, TypeORM `onDelete: 'CASCADE'` is used on FK relationships (e.g., Dataset → DataRecord, Conversation → ChatMessage). Cross-entity cleanup of AILogs (which have no FK to the parent) is handled in application code within the delete action.

---

## Inter-Service Communication

| Action/Event | Source | Target | Purpose |
|-------------|--------|--------|---------|
| `dataset.listDatasets` | analysis (via ctx.call) | data | Get datasets for system prompt construction |
| `dataset.getDataset` | analysis (via ctx.call) | data | Get single dataset metadata |
| `tools.structured.*` | analysis (via ctx.call) | data | Execute structured data analysis tools |
| `tools.unstructured.*` | analysis (via ctx.call) | data | Execute unstructured text analysis tools |
| `session.deleted` event | analysis (emit) | data (listen) | Cascade delete all session data including AILogs (metadata type) |
| `metadata.generateMetadata` event | data (emit) | data (listen) | Trigger background AI metadata generation (logged to AILog) |
| `dataset.metadataReady` event | data (emit) | analysis (listen) | Update session status when metadata completes |

---

## TypeORM Migration Strategy

Migrations are managed via TypeORM CLI (`typeorm migration:generate` / `typeorm migration:run`). Each microservice has its own migration directory:

- `apps/domain.analysis/microservice.analysis/migrations/`
- `apps/domain.data/microservice.data/migrations/`

**pgvector setup** (data_db initial migration):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This must run before any table using the `vector` type.

**Note on camelCase identifiers**: TypeORM will double-quote all camelCase table and column names in generated SQL (e.g., `"dataRecords"`, `"sessionId"`). This is handled automatically by TypeORM's entity decorators. No manual quoting is needed in application code.
