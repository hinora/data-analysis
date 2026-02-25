# AI Stock Analysis - Developer Quickstart

This guide helps developers get started with the AI Stock Analysis feature.

## Prerequisites

- **Node.js** 20 LTS or higher
- **MongoDB** 6.x or higher (local or Docker)
- **Ollama** installed with `qwen3:14b` model
- **pnpm** package manager

## Environment Setup

### 1. Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: Download from https://ollama.com/download
```

Pull a model:
```bash
ollama pull qwen3:14b
```

### 2. Start MongoDB

Using Docker:
```bash
docker run -d --name stock-mongo -p 27017:27017 mongo:6
```

Or install locally from [mongodb.com](https://www.mongodb.com/try/download/community).

### 3. Configure Environment

Create `.env` in the microservice directory:

```bash
# apps/domain.platform/microservice.ai-stock-analysis/.env

# Database
MONGODB_URI=mongodb://localhost:27017/stock_analysis

# AI Provider
AI_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:14b

# Stock Data Provider
STOCK_PROVIDER=yahoo

# News API Keys (get free keys from providers)
NEWSAPI_KEY=your_newsapi_key
FINNHUB_API_KEY=your_finnhub_key

# Optional: Reddit API (for Reddit news source)
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=stock-analysis/1.0

# Scheduler
DEFAULT_SCHEDULE_TIME=06:00
DEFAULT_TIMEZONE=Asia/Ho_Chi_Minh
```

### 4. Install Dependencies

```bash
# From repo root
pnpm install

# Build the core library
cd lib && pnpm build && cd ..

# Install microservice dependencies
cd apps/domain.platform/microservice.ai-stock-analysis
pnpm install
```

## Running the Service

### Development Mode

```bash
cd apps/domain.platform/microservice.ai-stock-analysis
pnpm dev
```

The service starts on port 3000 by default. Access API at `http://localhost:3000/api/v1`.

### Running Tests

```bash
# Unit tests
pnpm test

# Integration tests (requires MongoDB)
pnpm test:integration

# Watch mode
pnpm test:watch
```

## Quick API Examples

### Create a Session

```bash
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "stockSymbol": "AAPL",
    "newsSources": ["newsapi", "finnhub"],
    "dailySchedule": {
      "enabled": true,
      "time": "06:00",
      "timezone": "Asia/Ho_Chi_Minh"
    }
  }'
```

### Trigger Manual Run

```bash
curl -X POST http://localhost:3000/api/v1/sessions/{sessionId}/run
```

### Get Latest Prediction

```bash
curl http://localhost:3000/api/v1/sessions/{sessionId}/predictions/latest
```

### List Historical Data

```bash
curl http://localhost:3000/api/v1/sessions/{sessionId}/historical?limit=30
```

### Get AI Message History (for debugging)

```bash
# List AI history for a session
curl http://localhost:3000/api/v1/sessions/{sessionId}/ai-history?limit=10

# Get specific AI conversation details
curl http://localhost:3000/api/v1/sessions/{sessionId}/ai-history/{historyId}

# Get AI history for a specific run
curl http://localhost:3000/api/v1/runs/{runId}/ai-history

# View failed AI requests
curl http://localhost:3000/api/v1/ai-history/errors?limit=5
```

## Project Structure

```
apps/
├── domain.analysis/
│   └── microservice.session/
│       ├── app.ts                # Entry point
│       ├── moleculer.config.ts
│       ├── package.json
│       ├── db/
│       │   └── session.table.ts  # Session schema & queries
│       ├── services/
│       │   └── session/
│       │       ├── index.ts          # settings.rest: "/sessions"
│       │       ├── create.action.ts
│       │       ├── get.action.ts
│       │       └── list.action.ts
│       └── __generated__/
├── domain.data/
│   ├── microservice.stock/
│   └── microservice.news/
├── domain.ai/
│   └── microservice.agents/
│       ├── db/
│       │   └── aiMessageHistory.table.ts  # AI message history
│       └── services/
│           ├── historicalAgent/
│           │   ├── run.event.ts        # Async event handler
│           │   └── completed.event.ts  # Emit when done
│           ├── newsAgent/
│           │   ├── run.event.ts
│           │   └── completed.event.ts
│           ├── predictionAgent/
│           │   ├── run.event.ts
│           │   └── completed.event.ts
│           ├── prediction/
│           │   ├── index.ts            # settings.rest: "/predictions"
│           │   └── ...
│           └── aiHistory/          # AI message history service
│               ├── index.ts            # settings.rest: "/ai-history"
│               ├── list.action.ts
│               └── get.action.ts
└── domain.scheduler/
    └── microservice.scheduler/

lib/adapters/                      # Shared adapters in core.lib
├── ai/
│   ├── ollama.adapter.ts
│   └── index.ts
├── stock-data/
│   └── yahoo.adapter.ts
└── news/
    ├── newsapi.adapter.ts
    ├── finnhub.adapter.ts
    ├── reddit.adapter.ts
    └── rss.adapter.ts
```

## Moleculer Architecture

### Internal vs External Communication

Services communicate via **Moleculer actions** (`ctx.call`), NOT HTTP. HTTP REST is only for frontend clients via the API Gateway.

```
┌─────────────┐     HTTP REST      ┌──────────────────┐
│   Frontend  │───────────────────▶│   API Gateway    │
│   (Next.js) │   (external)       │ (microservice.   │
└─────────────┘                    │      proxy)      │
                                   └────────┬─────────┘
                                            │ ctx.call (internal)
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
          ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
          │    Session      │     │     Stock       │     │     Agents      │
          │    Service      │     │    Service      │     │    Service      │
          └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Calling Services Internally

Use `ctx.call` for internal communication (type-safe with `TypedContext`):

```typescript
// From one service to another (internal, no HTTP)
const stockData = await ctx.call('stock.getHistory', { sessionId, days: 365 });
const news = await ctx.call('news.list', { sessionId, limit: 100 });
```

### Exposing HTTP Endpoints

**Step 1**: Configure service REST base path in `index.ts`:

```typescript
// services/session/index.ts
import type { ServiceSchema } from 'moleculer';

const service: Partial<ServiceSchema> = {
  name: 'session',
  settings: {
    rest: '/sessions',  // Base path for all actions in this service
  },
};

export default service;
```

**Step 2**: Add relative `rest` property to actions:

```typescript
// services/session/create.action.ts
export default defineAction<CreateSessionParams, CreateSessionResult>({
  // Relative to service base path: POST /sessions
  // Also callable via ctx.call('session.create', {...})
  rest: 'POST /',
  
  params: {
    stockSymbol: { type: 'string' },
    newsSources: { type: 'array' }
  },
  
  async handler(ctx: TypedContext<CreateSessionParams>) {
    // Implementation
  }
});

// services/session/get.action.ts
export default defineAction<GetSessionParams, GetSessionResult>({
  rest: 'GET /:id',  // GET /sessions/:id
  // ...
});
```

Actions **without** `rest` are internal-only (not accessible via HTTP):

```typescript
// services/stock/fetch.action.ts - NO rest property
export default defineAction<FetchStockParams, FetchStockResult>({
  // No rest property = internal only, not accessible via HTTP
  params: { sessionId: { type: 'string' }, days: { type: 'number' } },
  
  async handler(ctx) {
    // Only callable via ctx.call('stock.fetch', {...})
  }
});
```

## Key Concepts

### Event-Driven AI Agents

AI agents use **events** (asynchronous) instead of actions because AI inference takes time (30s-3min). The scheduler emits events, agents process in background, then emit completion events:

```typescript
// Scheduler triggers agent via event (non-blocking)
await ctx.emit('historicalAgent.run', { sessionId, runId });

// Agent handles event asynchronously
// services/historicalAgent/run.event.ts
import { defineEvent } from 'core.lib/broker';

export interface HistoricalAgentRunPayload {
  sessionId: string;
  runId: string;
}

export default defineEvent<HistoricalAgentRunPayload>({
  group: 'ai-workers',  // Load balance across instances

  async handler(ctx) {
    const { sessionId, runId } = ctx.params;
    
    // Process AI analysis (long-running)
    const analysis = await runHistoricalAnalysis(sessionId);
    
    // Emit completion event
    await ctx.emit('historicalAgent.completed', {
      sessionId,
      runId,
      success: true,
      analysisId: analysis.id
    });
  }
});
```

### Adapter Pattern

All external integrations use the adapter pattern:

```typescript
// Example: AI Provider Interface
interface AIProvider {
  analyze(prompt: string, options?: AnalyzeOptions): Promise<string>;
  summarize(content: string[], options?: SummarizeOptions): Promise<string>;
  predict(data: PredictionInput): Promise<PredictionOutput>;
}

// Ollama implementation
class OllamaAdapter implements AIProvider {
  // ...
}
```

### News Source Selection

Sessions require at least one news source. Configure per-session:

```typescript
const session = await createSession({
  stockSymbol: 'AAPL',
  newsSources: ['newsapi', 'reddit'],  // At least one required
});
```

### Daily Schedule

Each session has independent scheduling:

```typescript
await updateSchedule(sessionId, {
  enabled: true,
  time: '06:00',        // Local time
  timezone: 'Asia/Ho_Chi_Minh'
});
```

### Pipeline Timeout

AI agent pipelines have configurable timeouts to prevent stuck jobs when agents crash or hang. Default is 10 minutes, configurable per session (1-60 minutes):

```bash
# Update timeout for a session
curl -X PUT http://localhost:3000/api/v1/sessions/{sessionId}/timeout \
  -H "Content-Type: application/json" \
  -d '{ "pipelineTimeoutMinutes": 15 }'
```

```typescript
// Or via code
await updateSession(sessionId, {
  pipelineTimeoutMinutes: 15  // 15 minutes
});
```

If a pipeline exceeds the timeout:
- Run status is marked as `TIMEOUT`
- `timeoutReason` contains the error message
- `scheduler.pipelineTimeout` event is emitted for alerting

### Smart Deduplication

The scheduler skips redundant runs if no new data exists:
- Compares hash of latest data with previous run
- Logs skip reason in DailyRunLog
- Can be overridden with manual trigger

## Debugging

### Check Ollama Connection

```bash
curl http://localhost:11434/api/tags
```

### View Scheduler Status

```bash
curl http://localhost:3000/api/v1/scheduler/status
```

### Check Run Logs

```bash
curl http://localhost:3000/api/v1/sessions/{sessionId}/runs?limit=5
```

### View AI Agent Messages (Debugging)

```bash
# View recent AI conversations for a session
curl http://localhost:3000/api/v1/sessions/{sessionId}/ai-history

# View failed AI requests for debugging
curl http://localhost:3000/api/v1/ai-history/errors

# Get AI usage statistics
curl http://localhost:3000/api/v1/ai-history/stats?days=7
```

## Common Issues

### "OLLAMA_HOST connection refused"

- Ensure Ollama is running: `ollama serve`
- Check the host/port in `.env`

### "No news items collected"

- Verify API keys are configured
- Check rate limits on news providers
- Ensure at least one news source is selected

### "Stock symbol validation failed"

- Use valid exchange symbols (e.g., AAPL, GOOGL, MSFT)
- Check internet connectivity

## Next Steps

1. Review [data-model.md](data-model.md) for schema details
2. Check [contracts/](contracts/) for full API specifications
3. Read [research.md](research.md) for technology decisions
