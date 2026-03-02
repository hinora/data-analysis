# Tasks: Agentic AI Document Analysis

**Input**: Design documents from `/specs/001-agentic-data-analysis/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api-routes.yaml, quickstart.md

**Tests**: Test tasks are omitted from this task list. Add test phases per user story if TDD is desired.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend microservices**: `apps/domain.analysis/microservice.analysis/`, `apps/domain.data/microservice.data/`
- **Shared library**: `lib/`
- **API Gateway**: `apps/domain.platform/microservice.proxy/`
- **Frontend**: `frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold new microservices, install dependencies, configure environments

- [X] T001 Scaffold microservice.analysis using `npm run init:microservice -- analysis analysis session,conversation,chat` (generates app.ts, moleculer.config.ts, package.json, tsconfig.json in apps/domain.analysis/microservice.analysis/)
- [X] T002 Scaffold microservice.data using `npm run init:microservice -- data data upload,dataset,metadata,tools` (generates app.ts, moleculer.config.ts, package.json, tsconfig.json in apps/domain.data/microservice.data/)
- [X] T003 [P] Install new npm dependencies (papaparse, @types/papaparse, xlsx, pdf-parse, tabula-js, pgvector) at workspace root in package.json
- [X] T004 [P] Create .env file for microservice.analysis with ANALYSIS_DB_URI, TRANSPORTER, AI_PROVIDER, OLLAMA_HOST, OLLAMA_MODEL in apps/domain.analysis/microservice.analysis/.env
- [X] T005 [P] Create .env file for microservice.data with DATA_DB_URI, TRANSPORTER, AI_PROVIDER, OLLAMA_HOST, OLLAMA_MODEL, EMBEDDING_MODEL, MAX_FILE_SIZE_MB, UPLOAD_DIR in apps/domain.data/microservice.data/.env
- [X] T006 [P] Create data/uploads/ directory with .gitkeep for file storage

**Checkpoint**: Both microservice skeletons exist and dependencies are installed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core shared library infrastructure that multiple user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### AI Adapter Extensions (lib/)

- [X] T007 [P] Extend AI adapter types with ToolDefinition, ToolCall, ToolCallResult, ChatWithToolsParams, ChatWithToolsResponse, and generateEmbeddings types in lib/adapters/ai/types.ts
- [X] T008 Implement chatWithTools() and generateEmbeddings() methods in Ollama adapter using native tools parameter and embed() API in lib/adapters/ai/ollama.adapter.ts
- [X] T009 Implement chatWithTools() and generateEmbeddings() methods in Gemini adapter using functionDeclarations in lib/adapters/ai/gemini.adapter.ts
- [X] T010 [P] Update AI adapter index exports to include new tool-calling and embedding types in lib/adapters/ai/index.ts

### File Parser Adapters (lib/)

- [X] T011 [P] Create FileParserAdapter interface, ParseResult, ParsedDataset, ParseError types in lib/adapters/file-parser/types.ts
- [X] T012 [P] Implement column sanitizer utility (unicode normalize, strip special chars, camelCase, deduplicate, handle reserved words) in lib/adapters/file-parser/utils/column-sanitizer.ts
- [X] T013 [P] Implement type inferrer utility (detect string, number, date, boolean from sample values) in lib/adapters/file-parser/utils/type-inferrer.ts
- [X] T014 [P] Implement text chunker utility (recursive character splitter, 800-char target, 200-char overlap, paragraph/sentence/word boundaries) in lib/adapters/file-parser/utils/text-chunker.ts
- [X] T015 Implement CSV parser adapter using papaparse with auto-delimiter detection, header extraction, error reporting per row in lib/adapters/file-parser/csv.parser.ts
- [X] T016 Implement PDF parser adapter using pdf-parse for text extraction and tabula-js for table extraction in lib/adapters/file-parser/pdf.parser.ts
- [X] T017 Implement XLSM parser adapter using xlsx/SheetJS with multi-table detection per sheet (blank row/column boundary scanning) in lib/adapters/file-parser/xlsm.parser.ts
- [X] T018 Create file parser factory (format → adapter mapping) and barrel exports in lib/adapters/file-parser/index.ts

### Shared Entities & Gateway

- [X] T019 [P] Create shared AILog TypeORM entity (type enum chat/metadata, promptSent, responseReceived, model, provider, tokens, latency, toolCalls, status) in lib/database/ai-log.entity.ts
- [X] T020 Configure API Gateway routes for all new endpoints (sessions, upload, datasets, metadata, conversations, chat) in apps/domain.platform/microservice.proxy/services/api/gateway.service.ts
- [X] T020a [P] Generate initial TypeORM migration for analysis_db (Session entity) via `typeorm migration:generate` in apps/domain.analysis/microservice.analysis/migrations/
- [X] T020b [P] Generate initial TypeORM migration for data_db (Dataset, DataRecord, TextChunk, OriginalFile, AILog entities + `CREATE EXTENSION IF NOT EXISTS vector`) via `typeorm migration:generate` in apps/domain.data/microservice.data/migrations/

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Create Analysis Session (Priority: P1) 🎯 MVP

**Goal**: Users can create, view, and manage analysis sessions as isolated workspaces

**Independent Test**: Create a session via POST /api/v1/sessions, verify it appears in GET /api/v1/sessions with correct name, status "empty", creation date, and zero dataset/conversation counts

### Implementation for User Story 1

- [X] T021 [US1] Create Session TypeORM entity with id, name, status enum (empty/has-data/active/archived), datasetCount, conversationCount, createdAt, updatedAt and indexes in apps/domain.analysis/microservice.analysis/db/session.entity.ts
- [X] T022 [US1] Configure TypeORM data source connection for analysis_db and register Session entity in apps/domain.analysis/microservice.analysis/db/index.ts (**Note**: T054 also modifies this file to register Conversation, ChatMessage, and AILog entities)
- [X] T023 [P] [US1] Implement createSession action (optional name, auto-generate if omitted as "Session — {date}") in apps/domain.analysis/microservice.analysis/services/session/createSession.action.ts
- [X] T024 [P] [US1] Implement listSessions action with pagination (page, limit) sorted by createdAt DESC in apps/domain.analysis/microservice.analysis/services/session/listSessions.action.ts
- [X] T025 [P] [US1] Implement getSession action returning full session details in apps/domain.analysis/microservice.analysis/services/session/getSession.action.ts
- [X] T026 [P] [US1] Implement renameSession action with name validation (1–200 chars) in apps/domain.analysis/microservice.analysis/services/session/renameSession.action.ts
- [X] T027 [US1] Implement deleteSession action that removes session, emits session.deleted event for cross-service cascade, and handles session status transitions (empty→has-data when first dataset imported, has-data→active when first conversation created) in apps/domain.analysis/microservice.analysis/services/session/deleteSession.action.ts
- [X] T027a [US1] Implement session status transition logic — update session status to 'has-data' on first dataset import (listen for metadata.generateMetadata), to 'active' on first conversation creation, in a shared utility or inline in relevant actions in apps/domain.analysis/microservice.analysis/services/session/updateSessionStatus.action.ts
- [X] T028 [P] [US1] Create useSession hook (createSession, listSessions, getSession, renameSession, deleteSession) in frontend/src/hooks/useSession.ts
- [X] T029 [P] [US1] Create SessionList and SessionCard components in frontend/src/components/session/
- [X] T030 [US1] Create sessions dashboard page with "New Session" button and session list in frontend/src/pages/sessions/index.tsx
- [X] T031 [US1] Create session workspace page (placeholder for datasets and conversations panels) in frontend/src/pages/sessions/[sessionId]/index.tsx

**Checkpoint**: User Story 1 is fully functional — sessions can be created, listed, renamed, and deleted via UI and API

---

## Phase 4: User Story 2 — Upload and Import Documents (Priority: P1)

**Goal**: Users can upload PDF, CSV, or XLSM files; the system parses, detects structure, imports data to database, and stores original files

**Independent Test**: Upload a CSV with headers to a session via POST /api/v1/sessions/{id}/upload, verify datasets are created with correct column mappings, row count, and data types. Upload a PDF with tables and text, verify both structured and unstructured datasets are created. Upload duplicate file, verify 409 response

### Implementation for User Story 2

- [X] T032 [P] [US2] Create OriginalFile TypeORM entity with id, sessionId, filename, mimeType, fileSize, fileHash, storagePath, createdAt and unique index on (sessionId, fileHash) in apps/domain.data/microservice.data/db/original-file.entity.ts
- [X] T033 [P] [US2] Create Dataset TypeORM entity with all columns (sessionId, originalFileId, name, fileType, datasetType, metadataStatus, rowCount, columnCount, columnMappings JSONB, sheetName, tablePosition, sourceFileHash, structuredMetadata, unstructuredMetadata, relationships) and indexes in apps/domain.data/microservice.data/db/dataset.entity.ts
- [X] T034 [P] [US2] Create DataRecord TypeORM entity with id, datasetId, sessionId, data JSONB column and indexes in apps/domain.data/microservice.data/db/data-record.entity.ts
- [X] T035 [P] [US2] Create TextChunk TypeORM entity with id, datasetId, sessionId, content, sourcePage, sourceSection, orderIndex, embedding vector(768), createdAt and HNSW index in apps/domain.data/microservice.data/db/text-chunk.entity.ts
- [X] T036 [US2] Re-export shared AILog entity from lib/database/ai-log.entity.ts and register it in the data microservice data source (type: metadata usage) in apps/domain.data/microservice.data/db/ai-log.entity.ts
- [X] T037 [US2] Configure TypeORM data source connection for data_db with pgvector extension and register all entities (Dataset, DataRecord, TextChunk, OriginalFile, AILog) in apps/domain.data/microservice.data/db/index.ts
- [X] T037a [US2] Generate TypeORM migration for data_db entities (Dataset, DataRecord, TextChunk, OriginalFile, AILog + vector extension) in apps/domain.data/microservice.data/migrations/
- [X] T038 [US2] Implement uploadFile action — validate file type/size (reject concurrent uploads of same file via hash lock), compute hash, check duplicates, save original file, parse via FileParserAdapter, create Dataset(s), bulk-insert DataRecords/TextChunks, generate embeddings for text chunks via AI adapter generateEmbeddings(), emit metadata.generateMetadata event, update session datasetCount via cross-service call in apps/domain.data/microservice.data/services/upload/uploadFile.action.ts
- [X] T039 [US2] Implement listDatasets action returning datasets for a session with summary fields in apps/domain.data/microservice.data/services/dataset/listDatasets.action.ts
- [X] T040 [US2] Implement getDataset action returning full dataset details including metadata in apps/domain.data/microservice.data/services/dataset/getDataset.action.ts
- [X] T041 [US2] Implement session.deleted event handler to cascade-delete all datasets, data records, text chunks, original files, and AI logs for a session in apps/domain.data/microservice.data/services/session/sessionDeleted.event.ts
- [X] T042 [P] [US2] Create useDataset hook (listDatasets, getDataset, uploadFile) in frontend/src/hooks/useDataset.ts
- [X] T043 [P] [US2] Create FileUpload component with drag-and-drop, file type validation, progress indicator, and error display in frontend/src/components/upload/
- [X] T044 [US2] Integrate upload UI and dataset list into session workspace page in frontend/src/pages/sessions/[sessionId]/index.tsx

**Checkpoint**: User Story 2 is fully functional — files can be uploaded, parsed, and imported. Datasets appear in the session with correct schemas

---

## Phase 5: User Story 3 — AI-Generated Data Metadata (Priority: P1)

**Goal**: After import, the system automatically generates AI metadata (column descriptions, statistics, topics, summaries, entities, relationships) in the background

**Independent Test**: Upload a CSV with columns [name, department, salary, hire_date], verify dataset status transitions from "pending" → "in-progress" → "ready", and AI-generated metadata includes column descriptions, statistics (min/max/avg for salary), and dataset description. Upload a PDF narrative, verify unstructured metadata includes key topics, summary, and entities

### Implementation for User Story 3

- [X] T045 [US3] Implement generateMetadata event handler for structured datasets — generate column descriptions, summary statistics, dataset description via AI adapter, log to AILog, update dataset metadataStatus and structuredMetadata in apps/domain.data/microservice.data/services/metadata/generateMetadata.event.ts (**Note**: T046 and T047 extend this same file — implement sequentially)
- [X] T046 [US3] Extend generateMetadata event handler for unstructured text datasets — generate key topics, document summary, content domain, word count, entities via AI adapter, log to AILog, update dataset unstructuredMetadata in apps/domain.data/microservice.data/services/metadata/generateMetadata.event.ts
- [X] T047 [US3] Implement relationship detection logic — scan session datasets for shared column names (structured) and shared topics/entities (unstructured), store as relationships JSONB on Dataset in apps/domain.data/microservice.data/services/metadata/generateMetadata.event.ts
- [X] T047a [US3] Emit `dataset.metadataReady` event after successful metadata generation to notify microservice.analysis for session status updates in apps/domain.data/microservice.data/services/metadata/generateMetadata.event.ts
- [X] T047b [US3] Implement `dataset.metadataReady` event handler in microservice.analysis — listen for metadata completion and update session status/metadata as needed in apps/domain.analysis/microservice.analysis/services/dataset/metadataReady.event.ts
- [X] T048 [US3] Implement retryGeneration action to re-trigger metadata generation for datasets with status "failed" in apps/domain.data/microservice.data/services/metadata/retryGeneration.action.ts
- [X] T049 [P] [US3] Create MetadataPanel component to display structured metadata (column descriptions, statistics) and unstructured metadata (topics, summary, entities) with status indicators in frontend/src/components/dataset/MetadataPanel.tsx
- [X] T050 [US3] Integrate metadata display and status indicators into dataset views in session workspace page in frontend/src/pages/sessions/[sessionId]/index.tsx

**Checkpoint**: User Story 3 is fully functional — metadata generates automatically after upload, status transitions are visible, retry works for failed metadata

---

## Phase 6: User Story 5 — Chat with AI to Analyse Data (Priority: P1)

**Goal**: Users can create conversations, ask natural language questions, and the AI agent uses structured and unstructured tools to analyse data and return answers with confidence scores and citations

**Independent Test**: Upload a known CSV (sales data), create a conversation, ask "What is the total revenue?", verify AI invokes sumField tool and returns correct sum with confidence score, cited source, and tool usage log. Upload a PDF, ask "Summarise this report", verify AI uses summarizeDocument tool

### Entities for User Story 5

- [X] T051 [P] [US5] Create Conversation TypeORM entity with id, sessionId (FK → sessions), name, systemPrompt, messageCount, createdAt, updatedAt and indexes in apps/domain.analysis/microservice.analysis/db/conversation.entity.ts
- [X] T052 [P] [US5] Create ChatMessage TypeORM entity with id, conversationId (FK → conversations), sessionId, role enum (system/user/assistant), content, confidenceScore, citedSources JSONB, toolsUsed JSONB, reasoningSteps JSONB, createdAt and indexes in apps/domain.analysis/microservice.analysis/db/chat-message.entity.ts
- [X] T053 [US5] Re-export shared AILog entity from lib/database/ai-log.entity.ts and register it in the analysis microservice data source (type: chat usage) in apps/domain.analysis/microservice.analysis/db/ai-log.entity.ts
- [X] T054 [US5] Update analysis_db data source to register Conversation, ChatMessage, and AILog entities in apps/domain.analysis/microservice.analysis/db/index.ts (**Note**: T022 creates this file initially with Session entity — this task extends it)
- [X] T054a [P] [US5] Generate TypeORM migration for analysis_db new entities (Conversation, ChatMessage, AILog) in apps/domain.analysis/microservice.analysis/migrations/

### Conversation & Chat Actions

- [X] T055 [US5] Implement createConversation action — construct system prompt from session datasets (schemas, column mappings, AI metadata, tool definitions, mission statement, response format rules, cross-source instructions), enforce system prompt max token/char limit with truncation strategy for large dataset metadata, store as first ChatMessage, return Conversation in apps/domain.analysis/microservice.analysis/services/conversation/createConversation.action.ts
- [X] T056 [US5] Implement listConversations action returning conversations for a session with summary metadata in apps/domain.analysis/microservice.analysis/services/conversation/listConversations.action.ts
- [X] T057 [US5] Implement sendMessage action — save user message, load system prompt + conversation history, run AI tool-calling orchestration loop (max 10 iterations), execute tools via ctx.call to microservice.data, save assistant message with confidence/citations/tools/reasoning, log to AILog in apps/domain.analysis/microservice.analysis/services/chat/sendMessage.action.ts
- [X] T058 [US5] Implement getHistory action with pagination (page, limit) returning messages in chronological order in apps/domain.analysis/microservice.analysis/services/chat/getHistory.action.ts

### Structured Data Tools (15 tools)

- [X] T059 [P] [US5] Implement aggregate tool — multi-field aggregation pipeline querying DataRecord JSONB data column in apps/domain.data/microservice.data/services/tools/structured/aggregate.action.ts
- [X] T060 [P] [US5] Implement sumField tool — SUM((data->>field)::numeric) with optional groupBy in apps/domain.data/microservice.data/services/tools/structured/sumField.action.ts
- [X] T061 [P] [US5] Implement avgField tool — AVG((data->>field)::numeric) with optional groupBy in apps/domain.data/microservice.data/services/tools/structured/avgField.action.ts
- [X] T062 [P] [US5] Implement count tool — COUNT(*) with optional filter conditions on JSONB data in apps/domain.data/microservice.data/services/tools/structured/count.action.ts
- [X] T063 [P] [US5] Implement getTopByField tool — ORDER BY (data->>field) DESC LIMIT N on JSONB data in apps/domain.data/microservice.data/services/tools/structured/getTopByField.action.ts
- [X] T064 [P] [US5] Implement countAndGroup tool — COUNT(*) GROUP BY data->>field(s) in apps/domain.data/microservice.data/services/tools/structured/countAndGroup.action.ts
- [X] T065 [P] [US5] Implement getDistinctValues tool — SELECT DISTINCT data->>field with counts in apps/domain.data/microservice.data/services/tools/structured/getDistinctValues.action.ts
- [X] T066 [P] [US5] Implement filterByCondition tool — WHERE conditions (equals, range, contains, in) on JSONB data in apps/domain.data/microservice.data/services/tools/structured/filterByCondition.action.ts
- [X] T067 [P] [US5] Implement getMinMax tool — MIN/MAX on (data->>field)::numeric or ::timestamptz in apps/domain.data/microservice.data/services/tools/structured/getMinMax.action.ts
- [X] T068 [P] [US5] Implement correlateFields tool — Pearson correlation between two numeric JSONB fields in apps/domain.data/microservice.data/services/tools/structured/correlateFields.action.ts
- [X] T069 [P] [US5] Implement pivotTable tool — cross-tabulation by two categorical fields with aggregate function in apps/domain.data/microservice.data/services/tools/structured/pivotTable.action.ts
- [X] T070 [P] [US5] Implement joinDatasets tool — join two datasets on shared field producing combined result in apps/domain.data/microservice.data/services/tools/structured/joinDatasets.action.ts
- [X] T071 [P] [US5] Implement getPercentile tool — percentile values (P25, P50, P75, P99) for a numeric JSONB field in apps/domain.data/microservice.data/services/tools/structured/getPercentile.action.ts
- [X] T072 [P] [US5] Implement detectOutliers tool — identify records beyond 2 standard deviations for a numeric field in apps/domain.data/microservice.data/services/tools/structured/detectOutliers.action.ts
- [X] T073 [P] [US5] Implement sortByField tool — ORDER BY one or more JSONB fields (ASC/DESC) with limit in apps/domain.data/microservice.data/services/tools/structured/sortByField.action.ts

### Unstructured Text Tools (9 tools)

- [X] T074 [P] [US5] Implement semanticSearch tool — pgvector cosine distance search on TextChunk embeddings with sessionId pre-filter, return top-K chunks with scores in apps/domain.data/microservice.data/services/tools/unstructured/semanticSearch.action.ts
- [X] T075 [P] [US5] Implement summarizeDocument tool — retrieve text chunks for a dataset, send to AI adapter for summary generation in apps/domain.data/microservice.data/services/tools/unstructured/summarizeDocument.action.ts
- [X] T076 [P] [US5] Implement extractKeyTopics tool — send text chunks to AI adapter to identify main topics and themes in apps/domain.data/microservice.data/services/tools/unstructured/extractKeyTopics.action.ts
- [X] T077 [P] [US5] Implement extractEntities tool — send text to AI adapter to extract people, organisations, dates, locations, monetary values in apps/domain.data/microservice.data/services/tools/unstructured/extractEntities.action.ts
- [X] T078 [P] [US5] Implement answerFromContext tool — retrieve relevant chunks via vector search, send as context to AI adapter for question answering in apps/domain.data/microservice.data/services/tools/unstructured/answerFromContext.action.ts
- [X] T079 [P] [US5] Implement compareDocuments tool — compare content/themes/sentiment across two or more text datasets via AI adapter in apps/domain.data/microservice.data/services/tools/unstructured/compareDocuments.action.ts
- [X] T080 [P] [US5] Implement findSimilarChunks tool — given a chunk ID, find semantically similar passages via pgvector cosine distance in apps/domain.data/microservice.data/services/tools/unstructured/findSimilarChunks.action.ts
- [X] T081 [P] [US5] Implement timelineExtraction tool — send text to AI adapter to extract and order date-referenced events chronologically in apps/domain.data/microservice.data/services/tools/unstructured/timelineExtraction.action.ts
- [X] T082 [P] [US5] Implement sentimentAnalysis tool — send text passages to AI adapter for positive/neutral/negative sentiment determination in apps/domain.data/microservice.data/services/tools/unstructured/sentimentAnalysis.action.ts

### Frontend for User Story 5

- [X] T083 [P] [US5] Create useConversation hook (createConversation, listConversations) in frontend/src/hooks/useConversation.ts
- [X] T084 [P] [US5] Create useChat hook (sendMessage, getHistory) with loading state for complete-response delivery in frontend/src/hooks/useChat.ts
- [X] T085 [P] [US5] Create ChatMessageBubble component (user/assistant messages, confidence badge, cited sources, tools used, reasoning steps, AI disclaimer) in frontend/src/components/chat/ChatMessageBubble.tsx
- [X] T086 [P] [US5] Create ChatInput component (text input, send button, loading indicator) in frontend/src/components/chat/ChatInput.tsx
- [X] T087 [P] [US5] Create ConversationSidebar component (list conversations, "New Conversation" button) in frontend/src/components/chat/ConversationSidebar.tsx
- [X] T088 [US5] Create chat page with conversation sidebar, message history, and chat input in frontend/src/pages/sessions/[sessionId]/chat/[conversationId].tsx
- [X] T089 [US5] Add "New Conversation" and conversation list navigation to session workspace page in frontend/src/pages/sessions/[sessionId]/index.tsx
- [X] T089a [P] [US5] Create SystemPromptViewer component (expandable "System Context" section showing the conversation's system prompt) per FR-075 in frontend/src/components/chat/SystemPromptViewer.tsx
- [X] T089b [US5] Integrate SystemPromptViewer into chat page (collapsible panel above message history) in frontend/src/pages/sessions/[sessionId]/chat/[conversationId].tsx

**Checkpoint**: User Story 5 is fully functional — users can create conversations, ask questions, and receive AI-powered analysis responses using both structured and unstructured tools

---

## Phase 7: User Story 4 — View and Manage Imported Data (Priority: P2)

**Goal**: Users can browse datasets, preview data rows, view schemas, rename and delete datasets within a session

**Independent Test**: Upload files to a session, browse dataset list, preview first 50 rows of a dataset, rename a dataset, delete a dataset and verify it is removed along with its data records and original file

### Implementation for User Story 4

- [X] T090 [P] [US4] Implement previewDataset action returning first N rows with both original and camelCase column headers and detected types in apps/domain.data/microservice.data/services/dataset/previewDataset.action.ts
- [X] T091 [P] [US4] Implement renameDataset action with name validation in apps/domain.data/microservice.data/services/dataset/renameDataset.action.ts
- [X] T092 [US4] Implement deleteDataset action with cascade deletion of DataRecords, TextChunks, AILogs, and OriginalFile (if no other datasets reference it), update session datasetCount in apps/domain.data/microservice.data/services/dataset/deleteDataset.action.ts
- [X] T093 [P] [US4] Create DatasetList component displaying name, file type, row count, column count, import date, metadata status in frontend/src/components/dataset/DatasetList.tsx
- [X] T094 [P] [US4] Create DatasetPreview component with tabular view (original + camelCase headers, detected types, first 50 rows) in frontend/src/components/dataset/DatasetPreview.tsx
- [X] T095 [P] [US4] Create DatasetActions component (rename, delete) with confirmation dialogs in frontend/src/components/dataset/DatasetActions.tsx
- [X] T096 [US4] Extend useDataset hook with previewDataset, renameDataset, deleteDataset operations in frontend/src/hooks/useDataset.ts
- [X] T097 [US4] Integrate dataset browse, preview, and management UI into session workspace page in frontend/src/pages/sessions/[sessionId]/index.tsx

**Checkpoint**: User Story 4 is fully functional — datasets can be browsed, previewed, renamed, and deleted through the UI

---

## Phase 8: User Story 6 — Conversation History and Session Continuity (Priority: P2)

**Goal**: Multiple independent conversations per session with persistent history, pagination, rename, and delete

**Independent Test**: Create a session with data, start two conversations, ask questions in both, close browser, reopen, verify both conversations are listed with full message histories and AI retains context within each

### Implementation for User Story 6

- [X] T098 [P] [US6] Implement getConversation action returning full conversation details including system prompt in apps/domain.analysis/microservice.analysis/services/conversation/getConversation.action.ts
- [X] T099 [P] [US6] Implement renameConversation action with name validation in apps/domain.analysis/microservice.analysis/services/conversation/renameConversation.action.ts
- [X] T100 [US6] Implement deleteConversation action with cascade deletion of ChatMessages and AILogs (chat type) in apps/domain.analysis/microservice.analysis/services/conversation/deleteConversation.action.ts
- [X] T101 [P] [US6] Create ConversationList component with name, message count, creation date, last activity in frontend/src/components/session/ConversationList.tsx
- [X] T102 [US6] Extend useConversation hook with getConversation, renameConversation, deleteConversation in frontend/src/hooks/useConversation.ts
- [X] T103 [US6] Integrate conversation list and management UI (rename, delete) into session workspace page in frontend/src/pages/sessions/[sessionId]/index.tsx

**Checkpoint**: User Story 6 is fully functional — conversations persist, paginate, and can be managed independently

---

## Phase 9: User Story 7 — Manage Sessions (Priority: P3)

**Goal**: Enhanced sessions dashboard with status indicators, last activity dates, and delete confirmation for workspace organisation

**Independent Test**: Create multiple sessions, verify dashboard shows name, creation date, dataset count, conversation count, last activity, and status. Rename and delete sessions and verify cascade removal

### Implementation for User Story 7

- [X] T104 [US7] Enhance sessions dashboard with status badges (empty/has-data/active), last activity dates, dataset and conversation counts in frontend/src/pages/sessions/index.tsx
- [X] T105 [US7] Add session delete confirmation dialog with warning about cascade deletion of all associated data in frontend/src/components/session/SessionDeleteDialog.tsx

**Checkpoint**: User Story 7 is fully functional — sessions dashboard provides clear status overview and safe delete flows

---

## Phase 10: User Story 8 — AI Provider Flexibility (Priority: P3)

**Goal**: AI provider can be switched via AI_PROVIDER environment variable without code changes

**Independent Test**: Set AI_PROVIDER=ollama — verify all chat and metadata responses work. Change to AI_PROVIDER=gemini — verify all functionality works. Set AI_PROVIDER=invalid — verify clear startup error listing supported providers

### Implementation for User Story 8

- [X] T106 [US8] Add AI provider validation with fail-fast error listing supported providers (ollama, gemini) on startup in lib/config/index.ts
- [X] T107 [US8] Implement (or verify existing) AI adapter factory routing — ensure getAIAdapter() returns the correct Ollama or Gemini adapter based on AI_PROVIDER config, covering both chatWithTools and generateEmbeddings methods; add explicit error for unsupported provider in lib/adapters/ai/index.ts

**Checkpoint**: User Story 8 is fully functional — provider switching works via configuration only

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, and type generation

- [X] T108 [P] Run type generation for both new microservices with npm run generate:types:all
- [X] T109 [P] Update project documentation (creating-services.md, project-structure.md) with new microservices and adapters in docs/
- [X] T110 Run quickstart.md verification checklist (Ollama models, Java version, PostgreSQL databases, services start, gateway routes, lint passes)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) completion — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) — no dependencies on other stories
- **US2 (Phase 4)**: Depends on Foundational (Phase 2) + US1 (Phase 3) (needs session to upload into)
- **US3 (Phase 5)**: Depends on US2 (Phase 4) (needs datasets to generate metadata for)
- **US5 (Phase 6)**: Depends on US2 (Phase 4) + US3 (Phase 5) (needs data + metadata for system prompt)
- **US4 (Phase 7)**: Depends on US2 (Phase 4) — can run **in parallel** with US3/US5
- **US6 (Phase 8)**: Depends on US5 (Phase 6) (needs conversations to exist)
- **US7 (Phase 9)**: Depends on US1 (Phase 3) — can run **in parallel** with US2+
- **US8 (Phase 10)**: Depends on Foundational (Phase 2) — can start after foundation
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational
    ↓
Phase 3: US1 (Sessions)
    ↓
Phase 4: US2 (Upload/Import)  ←─── Phase 7: US4 (View/Manage Data) [parallel]
    ↓
Phase 5: US3 (Metadata)
    ↓
Phase 6: US5 (Chat/Analysis)
    ↓
Phase 8: US6 (Conversation History)
    ↓
Phase 11: Polish

Independent tracks after Foundational:
  ├─ Phase 9: US7 (Manage Sessions) — after US1
  └─ Phase 10: US8 (AI Provider Flexibility) — after Foundational
```

### Within Each User Story

- Entities/models before services
- Services before endpoint/action implementations
- Backend actions before frontend hooks
- Frontend hooks before frontend components
- Frontend components before page integration

### Parallel Opportunities

**Phase 2 (Foundational)**:
```
Parallel batch 1: T007, T011, T012, T013, T014, T019
Parallel batch 2: T008, T009, T015, T016, T017 (after T011-T014)
Parallel batch 3: T010, T018, T020
```

**Phase 4 (US2) — Entities**:
```
Parallel: T032, T033, T034, T035 (all entity files)
Then: T037 (database config, depends on entities)
```

**Phase 6 (US5) — Tools**:
```
All 15 structured tools (T059-T073): fully parallel (independent files)
All 9 unstructured tools (T074-T082): fully parallel (independent files)
Structured and unstructured tools: parallel with each other
All frontend hooks and components (T083-T087): parallel with each other
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 3 + 5)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 (Sessions)
4. Complete Phase 4: US2 (Upload/Import)
5. Complete Phase 5: US3 (Metadata)
6. Complete Phase 6: US5 (Chat/Analysis)
7. **STOP and VALIDATE**: Full end-to-end flow — create session → upload file → metadata generates → chat with AI → get analysis response
8. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test sessions independently → First demo
3. Add US2 → Test upload/import independently → Data ingestion demo
4. Add US3 → Test metadata generation → Auto-enrichment demo
5. Add US5 → Test AI chat → **MVP complete** 🎯
6. Add US4 → Test data management → Enhanced UX
7. Add US6 → Test conversation history → Multi-conversation workflows
8. Add US7 + US8 → Polish → Full feature

### Parallel Team Strategy

With multiple developers after Foundational is complete:
- **Developer A**: US1 → US2 → US3 → US5 (critical path)
- **Developer B**: US4 (after US2 entities exist) + US6 (after US5 core exists)
- **Developer C**: US7 + US8 + Polish

---

## Notes

- All structured data tools query JSONB `data` column using `(data->>field)::type` PostgreSQL operators
- All unstructured text tools use pgvector `<=>` cosine distance for vector similarity search
- System prompt construction in createConversation calls `dataset.listDatasets` cross-service to fetch session metadata
- AI tool-calling orchestration loop in sendMessage is capped at 10 iterations per request
- Background metadata generation is event-driven (metadata.generateMetadata → generateMetadata handler)
- Session deletion cascades cross-service via session.deleted Moleculer event
- Column name mapping (original → camelCase) is stored on Dataset and referenced in system prompt, metadata, and all tool invocations
- Upload preview shows first 10 rows (spec US2 acceptance), dataset browse preview shows first 50 rows (FR-046)
- FR-011 (data provenance): Provenance is maintained via the FK chain OriginalFile → Dataset → DataRecords/TextChunks (no separate provenance task needed)
- Each file parser adapter is behind the FileParserAdapter interface — swappable without service code changes
- pgvector HNSW index requires `CREATE EXTENSION IF NOT EXISTS vector` on data_db (handled in migration)
