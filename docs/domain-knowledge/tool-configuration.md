# Tool Configuration

The AI tool-calling system uses a centralised, configurable registry so that
individual tools can be enabled or disabled in one place. Both the **tool
definitions** (sent to the LLM during the orchestration loop) and the
**system prompt** (generated dynamically before each chat message) derive their
tool lists from the same configuration.

## Architecture

```mermaid
graph TD
    A[toolConfig.ts] -->|getDefaultToolEnabledConfig| B[ToolEnabledConfig]
    B -->|getEnabledToolActions| C[TOOL_TO_ACTION map]
    B -->|getEnabledToolDefinitions| D[ToolDefinition array]
    B -->|getEnabledToolNamesByCategory| E[structured / unstructured / web lists]
    C --> F[sendMessage.action.ts — orchestration loop]
    D --> F
    E --> G[services/chat/buildDynamicSystemPrompt.action.ts — dynamic system prompt]
```

## Key File

**`microservice.analysis/toolConfig.ts`**

Single source of truth containing:

| Export | Description |
|--------|-------------|
| `ToolName` | Union type of all tool names (alphabetical) |
| `ToolCategory` | `"structured"`, `"unstructured"`, or `"web"` |
| `ToolEnabledConfig` | `Record<ToolName, boolean>` |
| `ALL_TOOL_NAMES` | Sorted array of every tool name |
| `getDefaultToolEnabledConfig()` | Returns config with all tools **enabled** |
| `getEnabledToolActions(config)` | Filtered `{ toolName: "tools.action" }` map |
| `getEnabledToolDefinitions(config)` | Filtered `ToolDefinition[]` for the LLM |
| `getEnabledToolNamesByCategory(config)` | `{ structured: [...], unstructured: [...], web: [...] }` |
| `getToolCategory(name)` | Returns category for a tool name |

## How to Disable a Tool

Edit the config construction in the consuming file (e.g. `sendMessage.action.ts`):

```typescript
const toolEnabledConfig = getDefaultToolEnabledConfig();
// Disable specific tools:
toolEnabledConfig.countAndGroup = false;
toolEnabledConfig.pivotTable = false;

const TOOL_TO_ACTION = getEnabledToolActions(toolEnabledConfig);
```

The same pattern applies in `services/chat/buildDynamicSystemPrompt.action.ts`
for the dynamic system prompt. Because both files call
`getDefaultToolEnabledConfig()` and apply overrides, they stay in sync
automatically when the overrides are shared or centralised.

## Tool Categories

### Structured Data Tools (`structured`)

Operate on `structured-table` datasets (CSV, Excel rows/columns):

aggregate, avgField, correlateFields, count, countAndGroup,
countDistinctValues, detectOutliers, filterByCondition, getDistinctValues,
getMinMax, getPercentile, getTopByField, joinDatasets, pivotTable,
sortByField, sumField

> **Note:** The `count` tool supports both simple key-value equality filters
> (`filters`) and rich condition-based filtering (`conditions`) with operators:
> `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains` (case-insensitive
> substring match), and `in` (value in list). This allows the AI to count
> records matching complex criteria (e.g. names containing a keyword) without
> needing to fall back to `filterByCondition` + manual counting.

### Unstructured Text Tools (`unstructured`)

Operate on `unstructured-text` datasets (PDF, TXT, DOCX via vector embeddings):

answerFromContext, getChunks, semanticSearch

- **answerFromContext** — RAG pattern: answers a question using retrieved text
  context via vector search. Essential for question-answering on documents.
- **getChunks** — Retrieve text chunks by order index range. Use the document
  index from dataset metadata to find the relevant section, then call this
  tool with the section's chunk range to read the actual content.
- **semanticSearch** — Hybrid search combining vector similarity (pgvector) with
  keyword matching for finding relevant text passages.

> **Note:** Entity extraction, topic extraction, document summarization,
> sentiment analysis, and timeline extraction are now handled during metadata
> generation and stored in the dataset's `unstructuredMetadata`. This eliminates
> redundant AI calls during chat and provides the AI with pre-computed context
> including a document index that maps sections to chunk ranges.

### Web Tools (`web`)

Search the internet and fetch web page content:

webFetch, webSearch

> **webSearch** — Uses the **Brave Search API** via the `brave-search` npm package.
> Requires the `BRAVE_API_KEY` environment variable to be set.
> Supports filtering by country, language, and freshness (past day/week/month/year).
>
> **webFetch** — Uses **Puppeteer** (headless Chrome) to load and render a web page,
> executing JavaScript before extracting plain text. Suitable for SPAs and
> JS-heavy sites. Supports `waitForSelector` to wait for specific elements
> and `maxLength` to truncate large pages. Blocks images, fonts, and stylesheets
> for faster loading.

## Adding a New Tool

1. Add the tool name to the `ToolName` union type in `toolConfig.ts`.
2. Add an entry to `TOOL_REGISTRY` with `action`, `category`, and
   `definition` (OpenAI function-calling schema).
3. Implement the corresponding action in `microservice.data/services/tools/`.
4. Run `npm run generate:types:all` then `npm run lint:fix`.
