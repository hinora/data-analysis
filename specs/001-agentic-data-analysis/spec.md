# Feature Specification: Agentic AI Document Analysis

**Feature Branch**: `001-agentic-data-analysis`  
**Created**: February 25, 2026  
**Status**: Draft  
**Input**: User description: "I want to build an AI agentic that can analyse any document (PDF, XLSM, CSV) based on user questions. The user is able to create a session, then upload any data type; the system should detect the structure of the data and import it to the database. After that, the user will be able to chat with AI to analyse these data."

## Clarifications

### Session 2026-02-26

- Q: Where should vector embeddings be stored for unstructured text semantic search? → A: Stored as `vector(768)` columns on TextChunk rows in PostgreSQL via pgvector extension; similarity search performed using pgvector `<=>` cosine distance operator with HNSW index
- Q: Should AI chat responses be streamed token-by-token or delivered as a complete block? → A: Complete response only (no streaming); the frontend waits for the full AI response before displaying it
- Q: How should AI tool execution work (native function-calling, text parsing, or hybrid)? → A: Backend-orchestrated loop using AI provider function-calling. Tools are implemented as Moleculer service actions. The AI returns tool-call requests, the backend invokes the matching Moleculer action, sends the result back as a "tool" role message, and loops until the AI produces a final answer
- Q: What library/approach should be used for PDF parsing (table extraction + text extraction)? → A: `pdf-parse` for text extraction + `tabula-js` (Node.js wrapper for Tabula) for table extraction. Requires Java runtime on the server
- Q: What is the maximum number of tool-call iterations allowed per AI request before forcing a final answer? → A: 10 iterations max. If the limit is reached, the AI returns a partial answer with an explanation

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Analysis Session (Priority: P1)

As a user, I want to create a new analysis session so that I have a dedicated workspace where I can upload documents and ask questions about them.

The user opens the application, clicks "New Session", provides an optional session name, and receives confirmation that the session has been created. The session acts as an isolated container for all uploaded data and multiple conversation threads within that context.

**Why this priority**: Without a session, no other functionality is possible. This is the foundational building block for everything else.

**Independent Test**: Can be fully tested by creating a session and verifying it appears in the session list with correct metadata (name, creation date, status).

**Acceptance Scenarios**:

1. **Given** I am on the main page, **When** I click "New Session" and enter a session name "Q4 Sales Report", **Then** a new session is created with status "empty" and I see the session workspace
2. **Given** I click "New Session" without entering a name, **When** the session is created, **Then** it receives an auto-generated name based on the current date and time (e.g., "Session — Feb 25, 2026 14:30")
3. **Given** I have created a session, **When** I navigate to my sessions list, **Then** I see the session with its name, creation date, number of uploaded files (0), number of conversations (0), and status

---

### User Story 2 - Upload and Import Documents (Priority: P1)

As a user, I want to upload PDF, CSV, or XLSM files to my session so that the system can parse, detect the data structure, and import it into the database for analysis.

The user selects one or more files from their device. The system validates the file type, parses the content, detects the structure (columns, data types, headers), and stores both the original file and the parsed data in the database. The user sees a preview of the detected structure and the imported data summary.

**Why this priority**: Data ingestion is the core input for the entire system. Without data, the AI has nothing to analyse. This story, combined with Story 1, forms the minimum viable product.

**Independent Test**: Can be tested by uploading a CSV, PDF, and XLSM file to a session and verifying the system correctly detects headers, column types, and row counts for each.

**Acceptance Scenarios**:

1. **Given** I am in a session, **When** I upload a CSV file with headers, **Then** the system detects column names, infers data types (string, number, date, boolean), renames columns to camelCase keys (e.g., "Employee Full Name" → "employeeFullName"), and shows me a preview of the first 10 rows with both the original column names and the sanitized column keys
2. **Given** I am in a session, **When** I upload an XLSM file with multiple sheets, **Then** the system lists all sheets and scans each sheet for one or more distinct tables (identified by separate header rows, blank-row/column boundaries, or named ranges). Each detected table is imported as its own dataset with an independent schema, labelled by sheet name and table position (e.g., "Sheet1 — Table 1", "Sheet1 — Table 2")
3. **Given** I am in a session, **When** I upload an XLSM sheet that contains a single table, **Then** the system detects one table and imports it as a single dataset for that sheet
4. **Given** I am in a session, **When** I upload a PDF file containing a mix of narrative text and embedded tables, **Then** the system extracts each table as a structured dataset (with detected columns and types), and stores the surrounding narrative text as unstructured text — both are linked to the same source file
5. **Given** I am in a session, **When** I upload a PDF file containing only narrative text (no tables), **Then** the system stores the full text content, marks the dataset type as "unstructured text", and generates vector embeddings of the text chunks for semantic search
6. **Given** I upload a file with an unsupported format (e.g., .exe, .zip), **When** the upload is processed, **Then** the system rejects the file with a clear error message listing supported formats (PDF, CSV, XLSM)
7. **Given** I upload a malformed CSV (inconsistent column counts across rows), **When** the system parses it, **Then** it reports specific parsing errors with row numbers and allows the user to proceed with partial import or cancel
8. **Given** I upload a file that is identical to one already in the session (same hash), **When** processing completes, **Then** the system notifies me of the duplicate and skips re-import
9. **Given** a structured dataset has been imported, **When** the import completes, **Then** the system triggers AI metadata generation as a background process and shows a "Preparing data..." status indicator on the dataset. I can continue uploading other files or browsing the session while metadata generation is in progress
10. **Given** metadata generation is in progress for a dataset, **When** I view the dataset in the list, **Then** I see a status indicator (e.g., "Preparing data...") and the metadata section shows a loading state. Once complete, the status changes to "Ready" and the AI-generated metadata becomes visible
11. **Given** metadata generation is still in progress, **When** I try to start a conversation, **Then** the system warns me that some datasets are still being prepared and the conversation's system prompt may be incomplete — I can proceed anyway or wait

---

### User Story 3 - AI-Generated Data Metadata (Priority: P1)

As a user, I want the AI to automatically analyse every imported dataset — whether structured (CSV, XLSM tables) or unstructured (PDF text) — and generate descriptive metadata so that I can quickly understand each dataset's content, meaning, and relationships without manual inspection.

After any dataset is imported, the system automatically triggers AI metadata generation **as a background process** (via an event). The user sees a "Preparing data..." status on the dataset while metadata is being generated. The user can continue working (uploading more files, browsing data, starting conversations) without waiting. Once complete, the dataset status updates to "Ready" and the metadata becomes visible. The AI produces metadata appropriate to the dataset type:

- **Structured datasets (tables)**: A description for each column (what it likely represents), summary statistics (min/max/average/nulls for numeric columns; unique values and most frequent values for categorical columns), an overall description of what the dataset contains, and — when multiple datasets exist — potential relationships between them (shared columns, foreign key candidates).
- **Unstructured text datasets (PDF narratives)**: Key topics and themes extracted from the text, a document-level summary, estimated content domain (e.g., legal, financial, scientific), word/chunk count, and detected entities (people, organisations, dates, locations) that appear frequently.

**Why this priority**: AI-generated metadata is essential for effective data analysis. It helps users understand unfamiliar data, and the metadata is fed to the AI during chat conversations, dramatically improving the quality of analysis responses.

**Independent Test**: Can be tested by uploading (a) a known CSV (e.g., employee data with name, department, salary, hire_date columns) and verifying the AI generates accurate column descriptions, correct statistics, and meaningful dataset description; (b) a PDF narrative and verifying the AI generates key topics, a document summary, and detected entities.

**Acceptance Scenarios**:

1. **Given** I upload a CSV file with columns [name, department, salary, hire_date], **When** the import completes, **Then** the dataset appears with status "Preparing data..." and after metadata generation finishes in the background, I can view AI-generated descriptions for each column (e.g., salary: "Annual compensation amount in currency units")
2. **Given** a numeric column exists in the dataset, **When** metadata generation completes, **Then** summary statistics include minimum, maximum, average, and null count for that column
3. **Given** a categorical column exists (e.g., department), **When** metadata generation completes, **Then** I can see the unique value count and the top 5 most frequent values
4. **Given** a dataset has been imported, **When** metadata generation completes, **Then** an overall dataset description is generated summarising what the data represents (e.g., "Employee records containing personnel and compensation data")
5. **Given** a session contains two datasets with a shared column name (e.g., both have "product_id"), **When** I upload the second dataset, **Then** the system detects the potential relationship and displays it as a relationship suggestion
6. **Given** I ask the AI a question about my data, **When** the AI processes my question, **Then** it uses the AI-generated metadata (column descriptions, statistics, relationships) as context to produce a more informed answer
7. **Given** I upload a PDF file with narrative text, **When** the import completes, **Then** the dataset appears with status "Preparing data..." and after metadata generation finishes, I can view AI-generated metadata including: key topics, document summary, content domain, word count, and frequently mentioned entities
8. **Given** I upload a PDF containing both tables and narrative text, **When** metadata generation completes, **Then** each extracted table receives structured metadata (column descriptions, statistics) and each text block receives unstructured metadata (topics, summary, entities) independently
9. **Given** metadata generation is running for multiple datasets, **When** I view the session, **Then** each dataset shows its own independent status ("Preparing data..." or "Ready") — one dataset finishing does not block or affect others
10. **Given** metadata generation fails for a dataset (e.g., AI provider timeout), **When** I view the dataset, **Then** it shows a "Metadata failed" status with a retry option

---

### User Story 4 - View and Manage Imported Data (Priority: P2)

As a user, I want to browse the imported datasets in my session, view data previews, and manage them so that I can verify correctness before asking the AI questions.

The user can see a list of all datasets in a session, preview any dataset (first N rows), view the detected schema (column names and types), rename datasets, and delete datasets they no longer need.

**Why this priority**: Users need to verify and manage their data before analysis. This builds confidence that the AI will work with correct inputs.

**Independent Test**: Can be tested by uploading files, then browsing, previewing, renaming, and deleting datasets within the session.

**Acceptance Scenarios**:

1. **Given** a session has 3 imported datasets, **When** I open the session, **Then** I see a list of all datasets with name, file type (CSV/PDF/XLSM), row count, column count, and import date
2. **Given** I select a dataset, **When** I click "Preview", **Then** I see the first 50 rows in a tabular view with column headers and detected types
3. **Given** a dataset has a generic name, **When** I rename it to "Sales Data Q4", **Then** the name is updated and reflected in the dataset list and chat references
4. **Given** I no longer need a dataset, **When** I delete it, **Then** the dataset, its parsed data, and the original file are all removed from the session
5. **Given** I view the schema of a dataset, **When** a column type was incorrectly detected (e.g., number stored as string), **Then** I can see the detected type and the first few values to verify accuracy

---

### User Story 5 - Chat with AI to Analyse Data (Priority: P1)

As a user, I want to ask natural language questions about my uploaded data so that the AI agent analyses the data and provides answers, summaries, trends, and insights.

Within a session, the user can create multiple separate conversations (chat threads). Each conversation focuses on a different line of inquiry against the same session data. When a new conversation is started, the system automatically constructs a **system prompt** that is sent as the first message to the AI. This system prompt:

- Defines the AI's mission ("You are a data analysis agent...")
- Lists all available analysis tools with their names, parameters, and usage instructions
- Includes all session metadata: dataset schemas with column name mappings (original → camelCase), AI-generated metadata (column descriptions, statistics, relationships for structured data; topics, summaries, entities for unstructured text), sample data previews, and dataset types
- Instructs the AI on response format requirements (confidence scores, source citations, tool logging, disclaimers)
- Provides rules for tool selection (when to use structured vs. unstructured tools, how to chain tools, how to translate user column references using the name mapping)

The system prompt is the same structure for every conversation within a session, but its content reflects the current state of the session's datasets and metadata at the time the conversation is created. If new datasets are uploaded after a conversation starts, the system prompt for that conversation remains unchanged — the user can start a new conversation to pick up the latest data.

After the system prompt is set, the user types questions in the chat interface (e.g., "What is the total revenue by region?", "Show me the top 10 products by sales", "Summarise the key findings in this report"). The AI agent uses the system prompt context to select the appropriate analysis tools, execute them against the data, and return a response with supporting data references and a confidence score.

The AI agent has access to two categories of analysis tools:

**Structured Data Tools** (for table datasets):
| Tool | Purpose |
|------|------|
| aggregate | Perform multi-field aggregation pipelines (group, filter, project) |
| sumField | Calculate the sum of a numeric field, optionally grouped by another field |
| avgField | Calculate the average of a numeric field, optionally grouped by another field |
| count | Count total records, optionally filtered by conditions |
| getTopByField | Retrieve the top N records sorted by a specified field |
| countAndGroup | Count records grouped by one or more categorical fields |
| getDistinctValues | List all unique values for a specified field |
| filterByCondition | Retrieve records matching specified conditions (equals, range, contains, etc.) |
| getMinMax | Get the minimum and maximum values for a numeric or date field |
| correlateFields | Calculate correlation between two numeric fields across records |
| pivotTable | Cross-tabulate data by two categorical fields with an aggregate function |
| joinDatasets | Join two datasets on a shared field to produce a combined result |
| getPercentile | Calculate percentile values (P25, P50, P75, P99) for a numeric field |
| detectOutliers | Identify records where a numeric field falls outside expected range (e.g., beyond 2 standard deviations) |
| sortByField | Sort records by one or more fields (ascending or descending) |

**Unstructured Text Tools** (for vector/text datasets):
| Tool | Purpose |
|------|------|
| semanticSearch | Find the most relevant text chunks for a given query using vector similarity |
| summarizeDocument | Generate a concise summary of a document or set of text chunks |
| extractKeyTopics | Identify the main topics, themes, and subject areas from text content |
| extractEntities | Extract named entities (people, organisations, dates, locations, monetary values) from text |
| answerFromContext | Answer a specific question using retrieved text chunks as context |
| compareDocuments | Compare content, themes, or sentiment across two or more text datasets |
| findSimilarChunks | Given a specific text chunk, find other semantically similar passages |
| timelineExtraction | Extract and order date-referenced events from text into a chronological sequence |
| sentimentAnalysis | Determine the overall sentiment (positive, neutral, negative) of text passages |

The AI selects which tools to invoke based on the user's question, dataset types available, and AI-generated metadata context. Multiple tools may be chained in a single response (e.g., filterByCondition → sumField → format answer). Crucially, the AI can combine tools from **both** categories in a single answer — for example, using `semanticSearch` to find relevant text passages from a PDF report **and** `sumField` to calculate totals from a CSV datasheet, then synthesising both results into a unified response. This cross-source analysis is a core capability: the AI is never limited to querying only one data source at a time.

**Why this priority**: This is the core value proposition — the reason users come to the platform. Combined with Stories 1 and 2, this completes the essential user journey.

**Independent Test**: Can be tested by uploading a known dataset (e.g., a CSV with sales data), asking specific questions with known answers, and verifying the AI response includes correct values and cites the source data. For unstructured text, upload a known PDF and verify semantic search and summarisation produce relevant results.

**Acceptance Scenarios**:

1. **Given** I have a session with a sales CSV imported, **When** I start a new conversation, **Then** the system constructs a system prompt containing the dataset schema, column name mappings, AI-generated metadata, available tools, and mission instructions — and sends it to the AI before my first question
2. **Given** I am in a conversation, **When** I ask "What is the total revenue?", **Then** the AI invokes the `sumField` tool on the revenue column and returns the correct sum with a confidence score and cites the dataset and column used
3. **Given** I have multiple datasets in a session, **When** I ask a question that spans two datasets, **Then** the AI uses `joinDatasets` or cross-references data from both datasets in its answer
4. **Given** I ask a follow-up question, **When** the AI responds, **Then** it considers the system prompt and the full conversation history within that conversation for context
5. **Given** I ask a question that cannot be answered from the available data, **When** the AI responds, **Then** it explicitly states what data is missing and suggests what additional data would be needed
6. **Given** I ask a question about unstructured text from a PDF, **When** the AI responds, **Then** it uses `semanticSearch` to find the most relevant text passages and `answerFromContext` to provide an answer with references to the source document and page/section
7. **Given** I ask a broad question like "summarise this report", **When** the AI responds, **Then** it invokes `summarizeDocument` across all unstructured text in the session and synthesises a coherent summary
8. **Given** the AI returns a quantitative answer, **When** I view the response, **Then** it includes: the answer, confidence score (0–1), data sources cited, tools used, reasoning steps, and a disclaimer that it is AI-generated analysis
9. **Given** I ask "What are the top 5 departments by headcount?", **When** the AI responds, **Then** it invokes `countAndGroup` on the department field, then `getTopByField` to rank them, and returns a formatted result
10. **Given** I ask "Find mentions of regulatory compliance in this report", **When** the AI responds, **Then** it invokes `semanticSearch` with the query, retrieves relevant chunks, and uses `extractEntities` to highlight specific regulations or compliance references
11. **Given** I have a session with both a CSV datasheet and a PDF report, **When** I ask "What was our Q4 revenue and what did the annual report say about Q4 performance?", **Then** the AI invokes `sumField` on the revenue column of the CSV **and** `semanticSearch` + `answerFromContext` on the PDF text, combining both results into a single unified answer that cites both data sources
12. **Given** I have structured sales data and a PDF market analysis, **When** I ask "How do our top 5 products compare to the market trends mentioned in the report?", **Then** the AI uses `getTopByField` on the sales dataset and `semanticSearch` on the PDF, then synthesises a comparison citing both sources
13. **Given** I want to explore a different angle on my data, **When** I start a second conversation in the same session, **Then** it receives its own system prompt (reflecting the current session state) and a fresh conversation history, while the first conversation remains intact
14. **Given** a new dataset was uploaded after I started a conversation, **When** I ask about the new dataset in the existing conversation, **Then** the AI may not have this dataset in its system prompt context — I should start a new conversation to include it

---

### User Story 6 - Conversation History and Session Continuity (Priority: P2)

As a user, I want to manage multiple conversations within a session and have each conversation's history preserved so that I can return later, continue where I left off, see previous questions and answers, and build on prior analysis.

Each session can contain multiple conversations (chat threads). Each conversation has its own system prompt (constructed at conversation creation time) and its own chronological message history. When the user opens a session, they see a list of all conversations. Opening a conversation shows the full message history. The AI uses the system prompt and that conversation's history as context for new questions.

**Why this priority**: Session continuity is essential for multi-step analysis workflows. Multiple conversations let users explore different analysis angles without polluting each thread.

**Independent Test**: Can be tested by creating a session, starting two conversations, asking questions in both, closing the session, reopening it, and verifying both conversations are listed with their full histories and the AI retains context within each.

**Acceptance Scenarios**:

1. **Given** I am in a session with data imported, **When** I click "New Conversation", **Then** a new conversation is created with an auto-generated name and the system prompt is constructed from the current session state
2. **Given** I have an active conversation, **When** I close the browser and reopen the session later, **Then** I see a list of all conversations and can select one to view its full message history in chronological order
3. **Given** I asked "What is the average price?" earlier in Conversation 1, **When** I now ask "Break that down by category" in the same conversation, **Then** the AI understands "that" refers to the average price from the prior message
4. **Given** I have Conversation 1 about sales trends and Conversation 2 about product categories, **When** I open Conversation 2, **Then** I see only the messages from Conversation 2 — the two conversations are fully independent
5. **Given** a conversation has a long history (50+ messages), **When** I open it, **Then** messages load progressively (pagination) without performance degradation
6. **Given** I want to organise my conversations, **When** I rename a conversation from "Conversation — Feb 26, 14:00" to "Revenue Analysis", **Then** the name is updated in the conversation list
7. **Given** I no longer need a conversation, **When** I delete it, **Then** all messages and AI logs for that conversation are removed, but other conversations and session data remain intact

---

### User Story 7 - Manage Sessions (Priority: P3)

As a user, I want to view, rename, and delete my sessions so that I can keep my workspace organised.

The user sees a dashboard of all sessions with status indicators, can rename sessions for clarity, and can delete sessions they no longer need (which removes all associated data, files, and conversation history).

**Why this priority**: Organisational feature for users with multiple analysis projects. Core functionality works without this but usability degrades over time.

**Independent Test**: Can be tested by creating multiple sessions and verifying list display, rename, and delete operations work correctly.

**Acceptance Scenarios**:

1. **Given** I have multiple sessions, **When** I view the sessions dashboard, **Then** I see each session with name, creation date, number of datasets, number of conversations, and last activity date
2. **Given** I want to rename a session, **When** I update the name from "Session — Feb 25" to "Annual Report Analysis", **Then** the name is updated everywhere
3. **Given** I delete a session, **When** deletion completes, **Then** all associated data (datasets, parsed data, original files, conversations, conversation history, AI logs) are permanently removed

---

### User Story 8 - AI Provider Flexibility (Priority: P3)

As an administrator, I want to switch the AI provider (e.g., Ollama to Gemini) via configuration so that the platform can optimise for cost, performance, or capability without code changes.

The system uses the existing adapter pattern for AI integration. The default provider is Ollama (local). Administrators can switch to Gemini or other providers by changing environment configuration.

**Why this priority**: Important for long-term flexibility and cost management but not required for the initial MVP.

**Independent Test**: Can be tested by changing the `AI_PROVIDER` environment variable and verifying all chat responses continue to work correctly with the new provider.

**Acceptance Scenarios**:

1. **Given** the system is configured with Ollama, **When** I change `AI_PROVIDER` to "GEMINI", **Then** all AI chat responses use Gemini without any code changes
2. **Given** an invalid AI provider is configured, **When** the system starts, **Then** a clear error message lists the supported providers

---

### Edge Cases

- What happens when a user uploads a very large file (>100 MB)?
  - The system enforces a configurable max file size (default 100 MB) and returns a clear error message if exceeded
- What happens when a CSV file uses a non-standard delimiter (semicolons, tabs)?
  - The parser auto-detects the delimiter; if detection fails, the user is prompted to specify the delimiter manually
- How does the system handle XLSM files with complex formulas or macros?
  - Only the computed cell values are imported; formulas and macros are ignored. The user is informed that formula logic is not preserved
- How does the system handle an XLSM sheet with no clear table boundaries?
  - If no distinct table boundaries are detected (no blank rows/columns separating regions), the entire sheet is treated as a single table
- What happens when vector search returns no relevant results for a question?
  - The AI informs the user that no closely matching content was found and suggests rephrasing the question or uploading additional documents
- What happens when the AI inference takes longer than 3 minutes?
  - The system shows a progress indicator and the scheduler detects stalled operations via heartbeat monitoring
- What happens when the tool-execution loop reaches 10 iterations without a final answer?
  - The backend forces the AI to return a partial answer with an explanation that the analysis complexity exceeded the iteration limit. The user is advised to break their question into smaller parts
- What happens when a user uploads files in rapid succession?
  - Uploads are queued and processed sequentially per session to avoid race conditions on schema detection
- What happens when the PDF parser cannot extract any meaningful content?
  - The system returns an error with specifics (e.g., "scanned image PDF detected — OCR not supported") and suggests converting to text-based PDF
- What happens when the user deletes a dataset that was referenced in previous AI responses?
  - Previous conversation messages remain intact for context; new questions can no longer reference the deleted dataset. The AI indicates the referenced data is no longer available if asked about it
- How does the system handle concurrent sessions from the same user?
  - Each session is fully isolated; concurrent operations in different sessions do not interfere with each other
- What happens when a user starts a new conversation after uploading new datasets?
  - The new conversation's system prompt includes all current datasets and metadata. Existing conversations retain their original system prompts and do not automatically update
- What happens when the system prompt is very large (many datasets, extensive metadata)?
  - The system prompt is constructed to stay within the AI provider's context window limit. If the metadata exceeds the limit, it is prioritised (schemas and column mappings first, then summaries, then sample data) and truncated with a note indicating that some context was omitted
- Can the user manually edit the system prompt?
  - No. The system prompt is automatically constructed from session state. Users can view it but not modify it. To change the context, users should upload/delete datasets and start a new conversation
- What happens when metadata generation fails (e.g., AI provider timeout)?
  - The dataset's metadata status is set to "failed" and the user sees a "Metadata failed — Retry" indicator. The user can retry manually. The data itself is already imported and browsable; only the AI-generated metadata is missing
- What happens when metadata is still generating and the user starts a conversation?
  - The system warns the user that some datasets have incomplete metadata. The system prompt will only include metadata for datasets with status "ready". The user can proceed or wait
- Can the AI answer a question using both structured data and unstructured text at the same time?
  - Yes. Cross-source analysis is a core capability. The AI can invoke structured data tools (e.g., sumField, filterByCondition) and unstructured text tools (e.g., semanticSearch, answerFromContext) in the same response, combining results into a unified answer

## Requirements *(mandatory)*

### Functional Requirements

#### Session Management
- **FR-001**: System MUST allow users to create analysis sessions with an optional name
- **FR-002**: System MUST auto-generate a session name if one is not provided
- **FR-003**: System MUST persist session metadata including name, creation date, status, and last activity timestamp
- **FR-004**: Users MUST be able to list all their sessions with summary metadata (including conversation count)
- **FR-005**: Users MUST be able to rename sessions
- **FR-006**: Users MUST be able to delete sessions, which MUST remove all associated data (datasets, original files, parsed data, conversations, conversation history, AI logs)

#### File Upload and Import
- **FR-007**: System MUST accept file uploads in the following formats: PDF, CSV, XLSM
- **FR-008**: System MUST reject unsupported file formats with a clear error listing supported types
- **FR-009**: System MUST enforce a configurable maximum file size per upload (default: 100 MB)
- **FR-010**: System MUST store the original uploaded file alongside parsed data
- **FR-011**: System MUST include source identifier, original format, import timestamp, and file hash for every ingested record (per constitution Principle II)

#### Data Structure Detection
- **FR-012**: System MUST automatically detect column names and headers from CSV and XLSM files
- **FR-013**: System MUST infer data types for each column (string, number, date, boolean) from the actual data values
- **FR-014**: System MUST detect and list all sheets in XLSM files
- **FR-015**: Within each XLSM sheet, the system MUST detect individual tables by identifying separate header rows, blank-row/column boundaries, or named ranges
- **FR-016**: Each detected table in an XLSM sheet MUST be imported as its own dataset with an independent schema, labelled by sheet name and table position
- **FR-017**: System MUST extract tabular data from PDF files where embedded tables are present, importing each table as a structured dataset. Table extraction MUST use `tabula-js` (Node.js wrapper for the Java-based Tabula library)
- **FR-018**: System MUST store non-tabular PDF content as unstructured text, marked with dataset type "unstructured text". Text extraction MUST use `pdf-parse`
- **FR-019**: For PDF files containing both tables and narrative text, the system MUST use `tabula-js` for table extraction and `pdf-parse` for text extraction, importing tables as structured datasets and surrounding text as unstructured content, all linked to the same source file
- **FR-020**: System MUST auto-detect CSV delimiters (comma, semicolon, tab, pipe)
- **FR-021**: System MUST report parsing errors with specific details (e.g., row number, error description) and allow partial import or cancellation
- **FR-022**: System MUST detect duplicate file uploads within the same session (by file hash) and skip re-import with a notification

#### Column Renaming and Mapping
- **FR-023**: System MUST automatically rename detected column names to valid camelCase identifiers (no spaces or special characters) before storing data records
- **FR-024**: System MUST store the mapping between each original column name and its sanitised camelCase key as part of the Dataset metadata
- **FR-025**: The data preview MUST display both the original column name and the camelCase key so users can see the mapping
- **FR-026**: All AI-generated metadata (descriptions, statistics) MUST reference both the original column name (for user context) and the camelCase key (for query execution)
- **FR-027**: The AI MUST use the column name mapping when translating user questions (which reference original names) into tool invocations (which use camelCase JSONB keys)

#### Data Storage
- **FR-028**: Each parsed data row MUST be stored as a JSONB column (schemaless) with a reference to its parent dataset, using the camelCase column keys
- **FR-029**: The detected schema (original column names, camelCase keys, types, order) MUST be stored as metadata on the Dataset entity — it is not enforced at the database level
- **FR-030**: All data records within a dataset MUST be queryable by dataset identifier without requiring knowledge of the record's internal structure
- **FR-031**: The storage approach MUST support datasets with varying schemas within the same session (e.g., a CSV with 5 columns and an XLSM table with 20 columns coexist naturally)

#### AI-Powered Metadata Generation
- **FR-032**: Upon successful import of any dataset (structured or unstructured), the system MUST emit a background event to trigger AI metadata generation — the import response returns immediately without waiting for metadata to complete
- **FR-033**: AI metadata generation MUST run asynchronously in the background (as a service event) so that the user can continue interacting with the session (uploading files, browsing data, starting conversations) while metadata is being generated
- **FR-034**: Each dataset MUST have a metadata status field with values: "pending" (awaiting generation), "in-progress" (generation running), "ready" (generation complete), "failed" (generation encountered an error)
- **FR-035**: The UI MUST display the dataset's metadata status to the user (e.g., "Preparing data..." for pending/in-progress, "Ready" for complete, "Metadata failed — Retry" for failed)
- **FR-036**: If metadata generation fails, users MUST be able to manually trigger a retry
- **FR-037**: For structured datasets, AI metadata generation MUST produce column-level metadata including: inferred description (what the column likely represents), data type explanation, and example values — referencing both the original column name and the camelCase key
- **FR-038**: For structured datasets, AI metadata generation MUST produce dataset-level summary statistics including: min, max, average, and null count per numeric column; unique value count and most frequent values per categorical column
- **FR-039**: For structured datasets, AI metadata generation MUST produce an overall dataset description summarising what the data represents, its likely source or domain, and key characteristics
- **FR-040**: For unstructured text datasets, AI metadata generation MUST produce: key topics and themes, a document-level summary, estimated content domain (e.g., legal, financial, scientific), word/chunk count, and frequently mentioned entities (people, organisations, dates, locations)
- **FR-041**: When a session contains multiple datasets, the AI MUST attempt to detect potential relationships between datasets (e.g., shared column names, overlapping key values for structured; shared topics or entities for unstructured) and store these as relationship metadata
- **FR-042**: AI-generated metadata MUST be stored on the Dataset entity and available for display to the user alongside the data preview once generation completes
- **FR-043**: AI-generated metadata MUST be included in the AI prompt context when the user asks analysis questions, so the AI can reference column descriptions, column name mappings, relationships, and text summaries
- **FR-044**: Users MUST be able to view the AI-generated metadata (column descriptions with original-to-database name mapping for structured; topics/summary/entities for unstructured) for any dataset in a session once the metadata status is "ready"

#### Data Preview and Management
- **FR-045**: Users MUST be able to view a list of all datasets in a session with metadata (name, type, row count, column count, import date, metadata status)
- **FR-046**: Users MUST be able to preview any dataset (first 50 rows in tabular format) with both original and camelCase column headers and detected types
- **FR-047**: Users MUST be able to rename datasets within a session
- **FR-048**: Users MUST be able to delete individual datasets (original file + parsed data + vector embeddings if applicable)

#### Vector Search and Semantic Retrieval
- **FR-049**: System MUST generate vector embeddings for all unstructured text content (PDF narratives, non-tabular content) upon import and store them as vector(768) columns on TextChunk rows in PostgreSQL via pgvector
- **FR-050**: System MUST chunk unstructured text into semantically meaningful segments before embedding (e.g., by paragraph, section, or page)
- **FR-051**: System MUST support semantic similarity search across embedded text chunks within a session using pgvector `<=>` cosine distance operator on PostgreSQL
- **FR-052**: When the AI processes a question involving unstructured text, the system MUST retrieve the top-K most relevant text chunks via pgvector cosine distance search and include them in the AI prompt context
- **FR-053**: Vector embeddings MUST be generated using the same AI provider adapter pattern (switchable via configuration)

#### AI Analysis Tools
- **FR-054**: The AI agent MUST have access to a defined set of structured data tools that it can invoke to answer user questions about table datasets
- **FR-054a**: Each analysis tool (structured and unstructured) MUST be implemented as a Moleculer service action (endpoint) on the backend, callable via the standard Moleculer action invocation pattern
- **FR-054b**: The backend MUST orchestrate a tool-execution loop when processing a user question: (1) send the user question plus conversation history and tool definitions to the AI provider using its native function-calling API, (2) if the AI responds with a tool call, the backend invokes the corresponding Moleculer action with the provided parameters, (3) the tool result is appended to the conversation as a message with role "tool", (4) the updated conversation is sent back to the AI, (5) this loop repeats until the AI returns a final text response with no further tool calls, (6) the final answer is returned to the user. The loop MUST be capped at a maximum of 10 iterations per request. If the limit is reached, the backend MUST force the AI to return whatever partial analysis it has, accompanied by an explanation that the iteration limit was reached
- **FR-054c**: The AI provider adapter MUST translate tool definitions into the provider's native function-calling format (e.g., Ollama tool schema, Gemini function declarations) so that the AI can select tools natively rather than via text parsing
- **FR-055**: Structured data tools MUST include at minimum: aggregate, sumField, avgField, count, getTopByField, countAndGroup, getDistinctValues, filterByCondition, getMinMax, correlateFields, pivotTable, joinDatasets, getPercentile, detectOutliers, sortByField
- **FR-056**: The AI agent MUST have access to a defined set of unstructured text tools that it can invoke to answer user questions about text/vector datasets
- **FR-057**: Unstructured text tools MUST include at minimum: semanticSearch, summarizeDocument, extractKeyTopics, extractEntities, answerFromContext, compareDocuments, findSimilarChunks, timelineExtraction, sentimentAnalysis
- **FR-058**: The AI MUST automatically select the appropriate tool(s) based on the user's question, the dataset type(s) available, and AI-generated metadata context — tool selection is performed by the AI provider via native function-calling, not by backend text parsing
- **FR-059**: The AI MUST be able to chain multiple tools in a single response via the backend orchestration loop (e.g., AI requests filterByCondition → backend executes → returns result → AI requests sumField → backend executes → returns result → AI produces final answer)
- **FR-060**: The AI MUST be able to combine structured data tools and unstructured text tools in a single orchestration loop to answer questions that require cross-source analysis (e.g., querying a CSV with `sumField` and a PDF with `semanticSearch` to produce one unified answer)
- **FR-061**: Each tool invocation in the orchestration loop MUST be logged as part of the AI response, including tool name, parameters used, and result summary
- **FR-062**: The AI MUST use the column name mapping (original → database) when translating user questions into tool parameters

#### AI Chat and Analysis
- **FR-063**: Users MUST be able to create multiple conversations (chat threads) within a single session
- **FR-064**: Each conversation MUST have its own name (auto-generated or user-provided), creation timestamp, and independent message history
- **FR-065**: Users MUST be able to ask natural language questions about their data within a conversation
- **FR-066**: Users MUST be able to rename and delete individual conversations within a session

#### System Prompt Construction
- **FR-067**: When a new conversation is started, the system MUST automatically construct a system prompt and send it as the first message to the AI
- **FR-068**: The system prompt MUST include the AI's mission statement defining its role as a data analysis agent, its expected behaviour, and response guidelines
- **FR-069**: The system prompt MUST include a complete listing of all available analysis tools (structured data tools and unstructured text tools) with their names, parameter descriptions, and usage examples
- **FR-070**: The system prompt MUST include all session dataset metadata: dataset names, dataset types (structured/unstructured), schemas with column name mappings (original → camelCase), AI-generated metadata (column descriptions, statistics, relationships for structured; topics, summaries, entities for unstructured), and sample data previews — only for datasets with metadata status "ready"
- **FR-071**: The system prompt MUST include instructions on response format: confidence scores, source citations, tool usage logging, reasoning steps, and AI-generated disclaimer
- **FR-072**: The system prompt MUST include rules for tool selection: when to use structured vs. unstructured tools, how to chain tools, **how to combine both tool types for cross-source questions**, and how to translate user column references (original names) into tool parameters (camelCase keys) using the column name mapping
- **FR-073**: The system prompt content MUST reflect the current state of the session's datasets and metadata at the time the conversation is created
- **FR-074**: The system prompt MUST be persisted as part of the conversation record so it can be included in every subsequent AI request within that conversation
- **FR-075**: The system prompt MUST be visible to the user (e.g., expandable "System Context" section) so they can understand what information the AI has access to

#### AI Response Processing
- **FR-076**: The AI agent MUST receive the system prompt, full conversation history, and the user's current question when processing each request
- **FR-077**: AI responses MUST include: the answer, confidence score (0–1), data sources cited, tools used, and reasoning steps (per constitution Principle III)
- **FR-078**: AI responses MUST include a disclaimer stating the analysis is AI-generated
- **FR-079**: The AI MUST explicitly state when a question cannot be answered from the available data and suggest what additional data is needed
- **FR-080**: The AI MUST be able to analyse structured data (via structured data tools), unstructured text (via text tools and vector search), and mixed content (combining both tool sets in a single response)
- **FR-081**: AI prompts and responses MUST be logged for reproducibility and debugging (per constitution Principle III)
- **FR-081a**: AI responses MUST be delivered as a complete block (non-streaming). The frontend displays a loading indicator while waiting and renders the full response once received. Token-by-token streaming is deferred to a future enhancement

#### Conversation History
- **FR-082**: System MUST persist all messages (system prompt, user questions, and AI responses) per conversation in chronological order
- **FR-083**: System MUST load and display full conversation history when a conversation is reopened
- **FR-084**: The AI MUST use the system prompt and conversation history as context for follow-up questions
- **FR-085**: Conversation history MUST support pagination for conversations with many messages
- **FR-086**: Users MUST be able to list all conversations within a session with summary metadata (name, creation date, message count, last activity)

#### AI Provider Configuration
- **FR-087**: System MUST support switching AI providers via the `AI_PROVIDER` environment variable without code changes
- **FR-088**: System MUST fail fast with a clear error if an unsupported AI provider is configured

### Key Entities

- **Session**: Represents an isolated analysis workspace. Key attributes: name, status (empty, has-data, active, archived), creation date, last activity date, associated user. Contains multiple Conversations and multiple Datasets.
- **Conversation**: A single chat thread within a session. Key attributes: name (auto-generated or user-provided), creation date, last activity date, system prompt (the full prompt constructed at creation time from session state), session reference. Contains an ordered list of ChatMessages. A session can have many conversations, each with an independent history and system prompt.
- **Dataset**: A single detected table or text block from an imported file. Key attributes: name, source file reference, file type (CSV/PDF/XLSM), dataset type (structured-table or unstructured-text), metadata status (pending, in-progress, ready, failed), detected schema with column name mapping (original column names → camelCase keys, types, order — stored as metadata, not enforced at database level), row count, import timestamp, file hash, sheet name and table position (for XLSM). AI-generated metadata for structured datasets: column descriptions (per-column inferred description referencing both original and camelCase names), summary statistics (min/max/avg/null count per numeric column; unique count and top frequent values per categorical column), overall dataset description, detected relationships with other datasets. AI-generated metadata for unstructured text datasets: key topics and themes, document-level summary, content domain, word/chunk count, frequently mentioned entities. A single uploaded file can produce multiple datasets (e.g., XLSM with 3 sheets × 2 tables each = 6 datasets; PDF with 2 embedded tables + narrative text = 3 datasets).
- **DataRecord**: Individual rows/records parsed from a structured table dataset. Stored as JSONB columns (schemaless) — each record contains the row data as key-value pairs using camelCase column keys, with a reference to its parent dataset. The record's internal structure is not enforced by the database; the Dataset's detected schema (including original-to-camelCase column name mapping) serves as the structural reference. Linked to a dataset and session.
- **TextChunk**: A segment of unstructured text from a PDF or non-tabular content. Key attributes: content, source page/section reference, ordering index, vector embedding (stored as a `vector(768)` column via pgvector; similarity search performed using pgvector `<=>` cosine distance operator with HNSW index). Linked to a dataset.
- **OriginalFile**: The raw uploaded file stored for provenance. Linked to one or more datasets. Includes file hash, size, original filename, MIME type.
- **ChatMessage**: A single message in the conversation. Key attributes: role (system, user, or assistant), content, timestamp, conversation reference. The first message in every conversation is the system prompt (role: system). Assistant messages additionally include confidence score, cited data sources, tools used, and reasoning steps.
- **AILog**: Audit record for each AI interaction. Includes prompt sent (system prompt + conversation history + user question), response received, model used, token counts, latency, confidence score, and conversation reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a session and upload their first file in under 2 minutes
- **SC-002**: File structure detection (schema, types, headers) completes within 30 seconds for files up to 50 MB
- **SC-003**: The AI provides a response to a data analysis question within 60 seconds for datasets up to 100,000 rows
- **SC-004**: 90% of users can successfully upload a file and ask their first analysis question without external help
- **SC-005**: AI responses include correct data source citations and confidence scores for 100% of analysis answers
- **SC-006**: System correctly detects column types (string, number, date, boolean) with at least 95% accuracy on well-formed CSV and XLSM files
- **SC-007**: System correctly identifies multiple distinct tables within a single XLSM sheet at least 90% of the time when tables are separated by blank rows or columns
- **SC-008**: Vector search retrieves relevant text passages within the top-5 results for at least 85% of questions about unstructured content
- **SC-009**: Conversation context is maintained across browser sessions — follow-up questions produce contextually accurate answers at least 85% of the time
- **SC-010**: AI-generated column descriptions match the actual column meaning at least 80% of the time on well-labelled datasets
- **SC-011**: AI-generated metadata (column descriptions, statistics, dataset description for structured; topics, summary, entities for unstructured) is available within 60 seconds of dataset import for datasets up to 100,000 rows
- **SC-012**: Column renaming produces valid camelCase identifiers for 100% of detected columns, and the original-to-camelCase name mapping is accurately preserved
- **SC-013**: The AI correctly selects appropriate analysis tools for at least 90% of user questions on well-formed datasets
- **SC-014**: For questions requiring cross-source analysis (structured + unstructured), the AI correctly combines tools from both categories in at least 85% of cases
- **SC-015**: System prompt construction completes within 5 seconds for sessions with up to 20 datasets
- **SC-016**: The system prompt provides sufficient context for the AI to answer questions about any dataset in the session without requiring additional context beyond the conversation history
- **SC-017**: Background metadata generation does not block the user from uploading additional files or browsing existing data
- **SC-018**: Switching AI providers via configuration results in zero downtime and no functionality loss

## Assumptions

- Users have modern browsers that support file upload APIs (drag-and-drop, file picker).
- PDF files with tabular data use text-based rendering (not scanned images). OCR for image-based PDFs is out of scope for the initial release.
- **PDF parsing**: PDF text extraction uses `pdf-parse` (pure Node.js). PDF table extraction uses `tabula-js`, a Node.js wrapper for the Java-based Tabula library, which requires a Java runtime (JRE 8+) installed on the server.
- XLSM macro execution is not supported; only computed cell values are imported.
- The platform targets single-tenant usage initially; multi-tenant isolation is deferred.
- Authentication is handled by the existing authentication framework in the platform; this feature does not introduce new auth mechanisms.
- File storage uses the local filesystem or a configurable storage backend; cloud object storage (S3, GCS) is a future enhancement.
- **Vector storage**: Vector embeddings for unstructured text are stored as `vector(768)` columns on TextChunk rows in PostgreSQL via the pgvector extension. Similarity search is performed using the pgvector `<=>` cosine distance operator with an HNSW index. No separate vector database is required.
- **Storage approach**: Each data row is stored as a JSONB column (schemaless) in the database using camelCase column keys. The detected schema (including original-to-camelCase column name mapping) is metadata on the Dataset entity and is not enforced at the database level. This allows datasets with arbitrary and varying column structures to coexist naturally.
- **Column renaming**: Original column names (which may contain spaces, special characters, mixed case) are automatically converted to valid camelCase identifiers. The mapping is always preserved so users see familiar names while the JSONB keys use clean identifiers.
- **AI metadata generation**: The AI generates metadata automatically in the background (via Moleculer events) upon import for both structured and unstructured datasets. The user is not blocked during generation — they see "Preparing data..." status and can continue working. Users cannot edit AI-generated metadata directly (they can re-trigger generation or override via dataset rename). AI metadata quality depends on column naming conventions and data clarity — poorly labelled columns may yield less accurate descriptions.
- **AI analysis tools**: The tools listed in User Story 5 represent the minimum required set. Additional tools may be added as analysis patterns emerge. Each tool is implemented as a Moleculer service action on the backend. The AI selects tools via native function-calling (provider-specific); users do not invoke tools directly. The backend orchestrates a loop: AI requests a tool call → backend invokes the Moleculer action → result returned as a "tool" role message → AI continues until it produces a final answer. The AI can combine structured and unstructured tools across multiple loop iterations for cross-source analysis.
- **System prompt**: The system prompt is constructed automatically from the session's current state when a conversation is created. It is not editable by users. If a session's data changes (new uploads/deletes), only new conversations will reflect those changes — existing conversations retain their original system prompt for consistency.
- **AI response delivery**: AI responses are delivered as complete blocks (non-streaming). The frontend shows a loading/progress indicator while the AI processes the request and renders the full response once received. Token-by-token streaming (SSE or WebSocket) is a future enhancement.
- **Multiple conversations**: A session can contain unlimited conversations. Each conversation is independent (own system prompt, own history). This allows users to explore different analysis angles without losing context from previous conversations.
