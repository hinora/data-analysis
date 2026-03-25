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
| `ToolCategory` | `"meta"`, `"structured"`, `"unstructured"`, `"visualization"`, or `"web"` |
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
toolEnabledConfig.pivotTable = false;
toolEnabledConfig.joinDatasets = false;

const TOOL_TO_ACTION = getEnabledToolActions(toolEnabledConfig);
```

The same pattern applies in `services/chat/buildDynamicSystemPrompt.action.ts`
for the dynamic system prompt. Because both files call
`getDefaultToolEnabledConfig()` and apply overrides, they stay in sync
automatically when the overrides are shared or centralised.

## Tool Categories

### Structured Data Tools (`structured`)

Operate on `structured-table` datasets (CSV, Excel rows/columns):

aggregate, correlateFields, countDistinctValues, detectOutliers,
filterByCondition, getDistinctValues, getPercentile, getRecords, joinDatasets,
pivotTable, sortByField

> **Note:** The `aggregate` tool is the primary tool for all numeric aggregation
> needs (sum, avg, min, max, count) with optional `groupBy`, `orderBy`, and
> rich `conditions` filtering (operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`,
> `contains`, `in`). Previously separate tools (`sumField`, `avgField`, `count`,
> `countAndGroup`, `getMinMax`) have been consolidated into `aggregate`.
> The `getTopByField` tool has been merged into `sortByField`.
> The `getRecords` tool retrieves rows from a dataset by record range.

### Unstructured Text Tools (`unstructured`)

Operate on `unstructured-text` datasets (PDF, TXT, DOCX via vector embeddings):

getChunks, semanticSearch

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

### Meta / Advanced Tools (`meta`)

Tools that orchestrate other tools or provide advanced capabilities:

createSubAgent, runPythonScript

- **createSubAgent** — Delegate a self-contained analysis task to a sub-agent.
  See `docs/domain-knowledge/sub-agent-delegation.md` for details.
- **runPythonScript** — Execute one or more tools to retrieve data, then run a
  Python script against the collected results in an isolated Docker sandbox.
  Each tool result becomes an element of the `input_data` list in Python.
  The sandbox (`python-sandbox` service in docker-compose.yml) runs with no
  network access and limited CPU/RAM for security.

## Adding a New Tool

1. Add the tool name to the `ToolName` union type in `toolConfig.ts`.
2. Add an entry to `TOOL_REGISTRY` with `action`, `category`, and
   `definition` (OpenAI function-calling schema).
3. Implement the corresponding action in `microservice.data/services/tools/`.
4. Run `npm run generate:types:all` then `npm run lint:fix`.
