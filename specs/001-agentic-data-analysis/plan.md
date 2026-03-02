# Implementation Plan: Agentic AI Document Analysis

**Branch**: `001-agentic-data-analysis` | **Date**: 2026-02-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-agentic-data-analysis/spec.md`

## Summary

Build an AI-powered document analysis platform where users create isolated sessions, upload documents (PDF, CSV, XLSM), and chat with an AI agent to analyse the imported data. The system parses files to detect structure, imports data into PostgreSQL as flexible JSONB documents, generates AI metadata in the background, stores vector embeddings for unstructured text (pgvector on PostgreSQL), and provides a chat interface powered by an AI tool-calling orchestration loop. The AI agent has access to 15 structured data tools and 9 unstructured text tools, implemented as Moleculer service actions, and can combine both tool types for cross-source analysis.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS (strict mode)  
**Primary Dependencies**: Moleculer 0.14.x (microservice framework), TypeORM 0.3.x (ORM), pgvector (vector similarity), Ollama/Gemini (AI providers), pdf-parse (PDF text), tabula-js (PDF tables, requires JRE 8+), xlsx/SheetJS (XLSM), papaparse (CSV), nomic-embed-text (embeddings via Ollama)  
**Storage**: PostgreSQL 16+ via TypeORM — one database per microservice; pgvector extension for vector embeddings; local filesystem for original files  
**Testing**: Test-first (Constitution Principle V); mock AI providers and external APIs in unit/integration tests  
**Target Platform**: Linux/macOS/Windows server (Node.js); Java runtime required for tabula-js; local PostgreSQL 16+ with pgvector  
**Project Type**: Web service (Moleculer microservices backend + Next.js frontend)  
**Performance Goals**: p95 < 500 ms for API endpoints; AI analysis < 3 min per session; file structure detection < 30s for files ≤ 50 MB; metadata generation < 60s for datasets ≤ 100k rows  
**Constraints**: Max 100 MB file upload; max 10 AI tool-call iterations per request; max 100 req/min per external API adapter; complete-response delivery (no streaming)  
**Scale/Scope**: Single-tenant; sessions with up to 20 datasets; datasets up to 100k rows; conversations with 50+ messages (paginated)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Microservice Architecture | **PASS** | New microservices under `apps/domain.analysis/` and `apps/domain.data/`; services use `defineAction`/`defineEvent`; inter-service via Moleculer actions/events; HTTP only through API Gateway; shared logic in `lib/` |
| II | Data Integrity & Provenance | **PASS** | Every DataRecord stores source identifier, original format, import timestamp, file hash (FR-010, FR-011); original files preserved (FR-010); duplicate detection by hash (FR-022); no silent rounding (numeric/date precision preserved) |
| III | AI Guardrails | **PASS** | System prompt defines AI scope (FR-068); all responses include confidence 0–1 and data source citations (FR-077); reasoning steps logged (FR-081); AI disclaimer on every response (FR-078); rate-limited external APIs; 3 retries with exponential backoff; tool-call loop capped at 10 iterations (FR-054b) |
| IV | Adapter-First Integration | **PASS** | AI providers behind `AIAdapter` interface (existing); file parsers behind new `FileParserAdapter` interface in `lib/adapters/file-parser/`; embedding generation via AI adapter; swapping provider = config change only (FR-087) |
| V | Test-First Development | **PASS** | Each user story independently testable (spec designates independent tests); external APIs and AI mocked in tests; integration tests for service contracts and inter-service communication |
| VI | Observability & Traceability | **PASS** | Structured JSON logs with Moleculer correlation IDs; AI prompts/responses logged in AILog entity (FR-081); long-running operations (AI inference, file parsing) report progress/heartbeat (edge case: 3-min timeout detection) |

### Post-Phase 1 Re-Check

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Microservice Architecture | **PASS** | 2 new microservices (analysis, data) + lib extensions. Within Constitution's expected pattern. API Gateway routes added. |
| II | Data Integrity & Provenance | **PASS** | DataRecord schema includes `datasetId`, `sessionId`, `importedAt`, `sourceFileHash`. OriginalFile entity stores raw uploads. Column name mapping is bijective and stored on Dataset. |
| III | AI Guardrails | **PASS** | System prompt template explicitly declares scope. Response format enforces confidence + citations. AILog captures full prompt/response/tokens. Tool loop max iterations = 10. |
| IV | Adapter-First Integration | **PASS** | Three adapter types defined: `AIAdapter` (existing, extended with tool-calling + embeddings), `FileParserAdapter` (new), `EmbeddingAdapter` (new or extended from AI). All behind interfaces. |
| V | Test-First Development | **PASS** | Data model entities map to testable user stories. Each action/event independently unit-testable with mocked dependencies. |
| VI | Observability & Traceability | **PASS** | AILog entity captures all AI interactions. Metadata generation events are independently observable. Dataset status field enables progress tracking. |

## Project Structure

### Documentation (this feature)

```text
specs/001-agentic-data-analysis/
├── plan.md              # This file
├── research.md          # Phase 0 output — technology decisions
├── data-model.md        # Phase 1 output — entity definitions
├── quickstart.md        # Phase 1 output — developer getting-started guide
├── contracts/           # Phase 1 output — API contracts
│   └── api-routes.yaml  # OpenAPI 3.0 routes for this feature
├── checklists/
│   └── requirements.md  # Requirements checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
lib/
├── adapters/
│   ├── ai/                          # Existing — extend with tool-calling + embeddings
│   │   ├── types.ts                 # Add tool-calling types (ToolDefinition, ToolCall, etc.)
│   │   ├── ollama.adapter.ts        # Add chatWithTools(), generateEmbeddings()
│   │   ├── gemini.adapter.ts        # Implement chatWithTools(), generateEmbeddings()
│   │   └── index.ts                 # Export new types
│   └── file-parser/                 # NEW — file parsing adapters
│       ├── index.ts                 # Factory + exports
│       ├── types.ts                 # FileParserAdapter interface
│       ├── csv.parser.ts            # CSV parser (papaparse)
│       ├── pdf.parser.ts            # PDF parser (pdf-parse + tabula-js)
│       ├── xlsm.parser.ts          # XLSM parser (xlsx/SheetJS)
│       └── utils/
│           ├── column-sanitizer.ts  # Column name sanitization
│           ├── text-chunker.ts      # Text chunking for embeddings
│           └── type-inferrer.ts     # Data type inference for columns
├── database/                        # Existing — TypeORM data source helpers
└── broker/                          # Existing

apps/
├── domain.analysis/
│   └── microservice.analysis/       # NEW — AI chat & analysis
│       ├── app.ts
│       ├── moleculer.config.ts
│       ├── package.json
│       ├── tsconfig.json
│       ├── db/
│       │   ├── index.ts
│       │   ├── session.entity.ts
│       │   ├── conversation.entity.ts
│       │   ├── chat-message.entity.ts
│       │   └── ai-log.entity.ts
│       └── services/
│           ├── session/
│           │   ├── createSession.action.ts
│           │   ├── listSessions.action.ts
│           │   ├── getSession.action.ts
│           │   ├── renameSession.action.ts
│           │   └── deleteSession.action.ts
│           ├── conversation/
│           │   ├── createConversation.action.ts      # Constructs system prompt
│           │   ├── listConversations.action.ts
│           │   ├── getConversation.action.ts
│           │   ├── renameConversation.action.ts
│           │   └── deleteConversation.action.ts
│           └── chat/
│               ├── sendMessage.action.ts        # Orchestration loop (tool-calling)
│               └── getHistory.action.ts     # Paginated message history
│
├── domain.data/
│   └── microservice.data/           # NEW — file upload, parsing, data management
│       ├── app.ts
│       ├── moleculer.config.ts
│       ├── package.json
│       ├── tsconfig.json
│       ├── db/
│       │   ├── index.ts
│       │   ├── dataset.entity.ts
│       │   ├── data-record.entity.ts
│       │   ├── text-chunk.entity.ts
│       │   ├── original-file.entity.ts
│       │   └── ai-log.entity.ts              # Shared AILog entity (type: "metadata")
│       └── services/
│           ├── upload/
│           │   └── uploadFile.action.ts        # File upload + parsing + import
│           ├── dataset/
│           │   ├── listDatasets.action.ts
│           │   ├── getDataset.action.ts
│           │   ├── previewDataset.action.ts
│           │   ├── renameDataset.action.ts
│           │   └── deleteDataset.action.ts
│           ├── metadata/
│           │   ├── generateMetadata.event.ts   # Background AI metadata generation (logged to AILog)
│           │   └── retryGeneration.action.ts   # Manual retry for failed metadata
│           └── tools/                    # AI analysis tools
│               ├── structured/
│               │   ├── aggregate.action.ts
│               │   ├── sumField.action.ts
│               │   ├── avgField.action.ts
│               │   ├── count.action.ts
│               │   ├── getTopByField.action.ts
│               │   ├── countAndGroup.action.ts
│               │   ├── getDistinctValues.action.ts
│               │   ├── filterByCondition.action.ts
│               │   ├── getMinMax.action.ts
│               │   ├── correlateFields.action.ts
│               │   ├── pivotTable.action.ts
│               │   ├── joinDatasets.action.ts
│               │   ├── getPercentile.action.ts
│               │   ├── detectOutliers.action.ts
│               │   └── sortByField.action.ts
│               └── unstructured/
│                   ├── semanticSearch.action.ts
│                   ├── summarizeDocument.action.ts
│                   ├── extractKeyTopics.action.ts
│                   ├── extractEntities.action.ts
│                   ├── answerFromContext.action.ts
│                   ├── compareDocuments.action.ts
│                   ├── findSimilarChunks.action.ts
│                   ├── timelineExtraction.action.ts
│                   └── sentimentAnalysis.action.ts
│
├── domain.platform/
│   └── microservice.proxy/          # Existing — add new API routes
│       └── services/api/
│           └── gateway.service.ts   # Add routes for session, conversation, chat, dataset, upload endpoints

frontend/
└── src/
    ├── pages/
    │   ├── sessions/
    │   │   ├── index.tsx            # Sessions dashboard
    │   │   └── [sessionId]/
    │   │       ├── index.tsx        # Session workspace (datasets + conversations)
    │   │       └── chat/
    │   │           └── [conversationId].tsx  # Chat interface
    ├── components/
    │   ├── session/
    │   ├── dataset/
    │   ├── chat/
    │   └── upload/
    └── hooks/
        ├── useSession.ts
        ├── useDataset.ts
        ├── useConversation.ts
        └── useChat.ts
```

**Structure Decision**: The existing monorepo pattern (`apps/domain.*/microservice.*/`) is followed. Two new microservices are introduced — `microservice.analysis` (session/conversation/chat orchestration) and `microservice.data` (file upload, parsing, data storage, AI analysis tools). File parsing adapters and text utilities go in `lib/adapters/file-parser/`. The existing `lib/adapters/ai/` is extended (not replaced) with tool-calling and embedding support. All HTTP endpoints go through the existing API Gateway. Database layer uses TypeORM entities with PostgreSQL + pgvector.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 2 new microservices (analysis + data) instead of 1 | Data ingestion/storage has fundamentally different concerns from AI chat orchestration. Data microservice owns datasets/records/files; analysis microservice owns sessions/conversations/chat. Clean separation of database ownership per Constitution Principle I. | A single microservice combining upload, parsing, storage, session management, conversation management, chat orchestration, and 24 analysis tools would exceed reasonable cognitive load and blast radius. |
| JRE dependency for tabula-js | Spec explicitly requires tabula-js for PDF table extraction (FR-017). No pure-JS alternative matches Tabula's table detection quality at this time. | pdf-parse v2 getTable() could eventually replace it, but is less mature. The adapter pattern ensures a future swap requires zero service code changes. |
