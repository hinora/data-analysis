# Dynamic Data Visualization

## Overview

The Dynamic Data Visualization feature allows the AI chat assistant to generate interactive charts that can be placed **anywhere within a message**. The AI can call `generateChartSpec` multiple times to produce multiple charts, and use `[chart:N]` placeholders in its text response to position each chart inline. Each chart can reference its data source via the optional `datasetName` field.

## Architecture

```mermaid
sequenceDiagram
    participant User
    participant Frontend as Frontend (Next.js)
    participant ChatSvc as chat service
    participant AI as AI Adapter
    participant Tools as tools.* actions
    participant ChartTool as tools.generateChartSpec

    User->>Frontend: "Compare sales and trends by region"
    Frontend->>ChatSvc: POST /chat/messages
    ChatSvc->>AI: chatWithTools(messages, tools)
    AI-->>ChatSvc: tool_call: aggregate(...)
    ChatSvc->>Tools: ctx.call("tools.aggregate", params)
    Tools-->>ChatSvc: aggregated data
    ChatSvc->>AI: chatWithTools(messages + tool result)
    AI-->>ChatSvc: tool_call: generateChartSpec(...) × N
    ChatSvc->>ChartTool: ctx.call("tools.generateChartSpec", params)
    ChartTool-->>ChatSvc: ChartSpec JSON (collected into charts[])
    ChatSvc->>AI: chatWithTools(messages + chart results)
    AI-->>ChatSvc: Final text with [chart:0], [chart:1] placeholders
    ChatSvc->>ChatSvc: Store charts[] in metadata.charts
    ChatSvc->>Frontend: SSE "done" event with metadata.charts
    Frontend->>Frontend: Parse placeholders & render inline DynamicChart components
```

## ChartSpec Type

```typescript
type ChartType = "bar" | "line" | "pie";

interface ChartDataPoint {
  label: string;
  value: number;
}

interface ChartSpec {
  chartType: ChartType;
  data: ChartDataPoint[];
  datasetName?: string; // Data source attribution
  title: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}
```

## Backend Components

### 1. Tool Action (`tools.generateChartSpec`)

- **Location**: `apps/domain.data/microservice.data/services/tools/generateChartSpec.action.ts`
- **Category**: `visualization`
- **Purpose**: Validates and returns a strictly typed `ChartSpec` JSON
- **Parameters**: `chartType`, `title`, `data[]`, optional `datasetName`, `xAxisLabel`, `yAxisLabel`
- **No database access**: Pure transformation/validation tool

### 2. Tool Configuration

- **Location**: `apps/domain.analysis/microservice.analysis/toolConfig.ts`
- `"generateChartSpec"` in `ToolName` union type
- `"visualization"` in `ToolCategory` union type
- Tool is registered with OpenAI-compatible function definition including `datasetName` parameter
- `getEnabledToolNamesByCategory` returns visualization tools separately

### 3. System Prompt

- **Location**: `apps/domain.analysis/microservice.analysis/services/chat/buildDynamicSystemPrompt.action.ts`
- "Visualization Tools" section instructs the AI:
  - Be **proactive**: generate charts whenever numerical results would be clearer as a visualization
  - First gather data using aggregation tools, then call `generateChartSpec`
  - Choose appropriate chart type (bar, line, pie)
  - Always provide the `datasetName` parameter to reference the data source
  - Do NOT print raw chart JSON in text
  - **Multiple charts**: call `generateChartSpec` multiple times; each call gets an index (0-based)
  - **Inline placement**: use `[chart:N]` placeholders in text to position charts
  - If no placeholders are used, charts appear at the end of the message
- "Data source referencing" section instructs the AI:
  - Always mention the dataset name when reporting data
  - Always pass `datasetName` to `generateChartSpec`

### 4. Orchestration Loop

- **Location**: `apps/domain.analysis/microservice.analysis/services/chat/sendMessage.action.ts`
- `handleNormalToolInLoop` returns `ChartSpec` when `generateChartSpec` is called
- `runOrchestrationLoop` collects all chart specs into a `charts: ChartSpec[]` array
- `saveAndFinalize` stores `charts` in `metadata.charts` JSONB field
- SSE "done" event includes `metadata` with `charts` array
- Visualization tools skip dataset type validation

### 5. ChatMessage Entity

- **Location**: `apps/domain.analysis/microservice.analysis/db/chat-message.entity.ts`
- `metadata` JSONB column (`MessageMetadata | null`)
- `MessageMetadata` contains:
  - `charts?: ChartSpec[]` — array of chart specs (current)
  - `chartSpec?: ChartSpec` — single chart spec (legacy, backward compat)

## Frontend Components

### 1. DynamicChart Component

- **Location**: `frontend/src/components/chat/DynamicChart.tsx`
- Uses [Recharts](https://recharts.org/) library for rendering
- Supports three chart types:
  - **Bar chart**: `BarChartRenderer` — for categorical comparisons
  - **Line chart**: `LineChartRenderer` — for trends over time
  - **Pie chart**: `PieChartRenderer` — for proportional distributions
- Validates ChartSpec before rendering (fallback warning shown for invalid specs)
- Shows data source label when `spec.datasetName` is provided
- Responsive container adapts to parent width

### 2. ChatMessageBubble Integration

- **Location**: `frontend/src/components/chat/ChatMessageBubble.tsx`
- **`resolveCharts()`**: reads charts from `metadata.charts` (preferred) or `metadata.chartSpec` (legacy fallback)
- **`buildContentSegments()`**: parses `[chart:N]` placeholders in message content and interleaves text segments with chart segments
  - If placeholders are found, charts are rendered at the placeholder positions
  - If no placeholders exist, charts are appended after the message text
  - Unreferenced charts (index not in any placeholder) are appended at the end
- Charts only rendered for assistant messages

### 3. ChatMessage Type

- **Location**: `frontend/src/hooks/useChat.ts`
- `metadata: MessageMetadata | null` on `ChatMessage` interface
- `MessageMetadata` contains `charts?: ChartSpec[]` and legacy `chartSpec?: ChartSpec`
- Exported `ChartSpec`, `ChartDataPoint`, `ChartType`, `MessageMetadata` types
