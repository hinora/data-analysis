# Implementation Plan: AI Stock Analysis System

**Branch**: `001-ai-stock-analysis` | **Date**: 2026-02-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-ai-stock-analysis/spec.md`

## Summary

Build an AI-powered stock analysis system with three autonomous agents (Historical Data, News Collection, Prediction) that run daily to provide investment insights. The system uses adapter patterns for AI providers (Ollama default), stock data providers (Yahoo Finance default), and news providers (NewsAPI.org, Finnhub, Reddit, RSS). Users create analysis sessions for specific stocks, configure news sources, and receive AI-generated predictions with disclaimers.

## Technical Context

**Language/Version**: Node.js 20 LTS with TypeScript 5.x (strict mode)  
**Primary Dependencies**: Moleculer (microservices), Mongoose (MongoDB ODM), node-cron (scheduling), axios (HTTP), ollama-js (AI)  
**Storage**: MongoDB (per-service databases per constitution)  
**Testing**: Jest with ts-jest, mongodb-memory-server for integration tests  
**Target Platform**: Linux server (Docker containers)
**Project Type**: Microservices monorepo (existing structure)  
**Performance Goals**: p95 < 500ms for API endpoints, agent analysis < 3 minutes per session  
**Constraints**: Max 100 requests/minute to external APIs per agent (constitution), max 3 retries with exponential backoff  
**Scale/Scope**: 50 concurrent analysis sessions, 2 years historical data per session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| I. Microservice Architecture | Each domain in separate microservice under `apps/domain.{name}/microservice.{name}/` | ✅ PASS | Will create: domain.analysis (session, scheduler), domain.data (stock, news), domain.ai (agents) |
| I. Microservice Architecture | Services stateless, MongoDB per service | ✅ PASS | Each service has own database |
| I. Microservice Architecture | Shared logic in `lib/` as `core.lib` | ✅ PASS | Adapters will be in lib/ |
| I. Microservice Architecture | Scaffold via `npm run init:microservice` | ✅ PASS | Will use existing tooling |
| II. Data Integrity | Stock data includes source attribution | ✅ PASS | HistoricalStockData includes source provider |
| II. Data Integrity | News retains original publication date, source URL, fetch timestamp | ✅ PASS | NewsItem entity includes all required fields |
| II. Data Integrity | Price data preserves original precision | ✅ PASS | Will store as-received from provider |
| III. AI Guardrails | Agents declare analysis scope | ✅ PASS | Each agent has explicit scope in spec |
| III. AI Guardrails | Outputs include confidence scores | ✅ PASS | PredictionReport includes confidence |
| III. AI Guardrails | Recommendations cite data sources | ✅ PASS | FR-036 requires supporting reasoning |
| III. AI Guardrails | Rate limiting on API calls | ✅ PASS | FR-026 + constitution 100 req/min |
| III. AI Guardrails | Max 3 retries with backoff | ✅ PASS | Edge case handling specifies this |
| IV. Test-First | Unit tests before implementation | ✅ PASS | Will follow TDD |
| IV. Test-First | Mock external APIs in tests | ✅ PASS | Will use mocks for Yahoo, NewsAPI, etc. |
| V. Observability | Structured logs with correlation IDs | ✅ PASS | Moleculer provides this |
| V. Observability | AI reasoning steps logged | ✅ PASS | DailyRunLog entity captures this |

**Constitution Gate**: ✅ PASSED - No violations identified

## Moleculer Communication Architecture

### Internal Service Communication

Services communicate via **Moleculer actions** (`ctx.call`), NOT HTTP REST. This provides:
- Type-safe calls with `TypedContext`
- Automatic load balancing
- Built-in retry/circuit breaker
- No network overhead within same broker

```typescript
// Service A calling Service B (internal)
const stockData = await ctx.call('stock.getHistory', { sessionId, days: 365 });
const news = await ctx.call('news.list', { sessionId, limit: 100 });
```

### External API (Frontend Only)

HTTP REST API is exposed **only via API Gateway** for frontend clients. The existing `apps/domain.platform/microservice.proxy` serves as the gateway.

```
┌─────────────┐     HTTP REST      ┌──────────────────┐
│   Frontend  │───────────────────▶│   API Gateway    │
│   (Next.js) │                    │ (microservice.   │
└─────────────┘                    │      proxy)      │
                                   └────────┬─────────┘
                                            │ ctx.call (internal)
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
          ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
          │    Session      │     │     Stock       │     │     Agents      │
          │    Service      │     │    Service      │     │    Service      │
          └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### API Contracts Purpose

The OpenAPI contracts in `/contracts/` define:
- **Gateway routes**: HTTP endpoints exposed to frontend
- **Request/Response schemas**: For frontend type generation
- **NOT internal service APIs**: Internal calls use TypeScript interfaces

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-stock-analysis/
├── plan.md              # This file
├── research.md          # Phase 0: Technology research
├── data-model.md        # Phase 1: MongoDB schemas
├── quickstart.md        # Phase 1: Developer guide
├── contracts/           # Phase 1: OpenAPI specs (for API Gateway → Frontend)
│   ├── session.api.yaml
│   ├── analysis.api.yaml
│   ├── scheduler.api.yaml
│   └── ai-history.api.yaml
└── tasks.md             # Phase 2 output (not created by /speckit.plan)
```

### Source Code (repository root)

**Note**: Actions with `rest: "METHOD /path"` are exposed via API Gateway AND callable internally via `ctx.call`. Actions without `rest` are internal-only (ctx.call only).

```text
lib/
├── adapters/
│   ├── ai/
│   │   ├── index.ts           # AI adapter factory
│   │   ├── types.ts           # Common AI interfaces
│   │   ├── ollama.adapter.ts  # Ollama implementation
│   │   └── gemini.adapter.ts  # Gemini implementation (future)
│   ├── stock-data/
│   │   ├── index.ts           # Stock data adapter factory
│   │   ├── types.ts           # Common stock data interfaces
│   │   └── yahoo.adapter.ts   # Yahoo Finance implementation
│   └── news/
│       ├── index.ts           # News adapter factory
│       ├── types.ts           # Common news interfaces
│       ├── newsapi.adapter.ts # NewsAPI.org implementation
│       ├── finnhub.adapter.ts # Finnhub News implementation
│       ├── reddit.adapter.ts  # Reddit implementation
│       └── rss.adapter.ts     # RSS Feeds implementation
├── broker/                    # Existing Moleculer utilities
├── config/                    # Existing config utilities
└── database/                  # Existing MongoDB utilities

apps/
├── domain.platform/
│   └── microservice.proxy/    # EXISTING - API Gateway
│       └── services/api/
│           └── gateway.service.ts  # Routes to internal services
├── domain.analysis/
│   └── microservice.session/
│       ├── app.ts                        # Entry point
│       ├── moleculer.config.ts           # Microservice config
│       ├── package.json
│       ├── tsconfig.json
│       ├── db/
│       │   ├── index.ts
│       │   └── session.table.ts          # Session schema & queries
│       ├── services/
│       │   └── session/
│       │       ├── index.ts              # settings.rest: "/sessions"
│       │       ├── create.action.ts      # rest: "POST /"
│       │       ├── get.action.ts         # rest: "GET /:id"
│       │       ├── list.action.ts        # rest: "GET /"
│       │       ├── delete.action.ts      # rest: "DELETE /:id"
│       │       ├── updateNewsSources.action.ts  # rest: "PUT /:id/news-sources"
│       │       ├── updateSchedule.action.ts     # rest: "PUT /:id/schedule"
│       │       └── updateTimeout.action.ts      # rest: "PUT /:id/timeout"
│       └── __generated__/                # Auto-generated types
├── domain.data/
│   ├── microservice.stock/
│   │   ├── app.ts
│   │   ├── moleculer.config.ts
│   │   ├── package.json
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   └── historicalStockData.table.ts
│   │   ├── services/
│   │   │   └── stock/
│   │   │       ├── index.ts              # settings.rest: "/stocks"
│   │   │       ├── fetch.action.ts       # (internal only)
│   │   │       ├── getHistory.action.ts  # rest: "GET /sessions/:sessionId/historical"
│   │   │       └── validate.action.ts    # rest: "GET /validate/:symbol"
│   │   └── __generated__/
│   └── microservice.news/
│       ├── app.ts
│       ├── moleculer.config.ts
│       ├── package.json
│       ├── db/
│       │   ├── index.ts
│       │   ├── newsItem.table.ts
│       │   └── newsSummary.table.ts
│       ├── services/
│       │   └── news/
│       │       ├── index.ts              # settings.rest: "/news"
│       │       ├── collect.action.ts     # (internal only)
│       │       ├── list.action.ts        # rest: "GET /sessions/:sessionId/items"
│       │       └── getSummaries.action.ts # rest: "GET /sessions/:sessionId/summaries"
│       └── __generated__/
├── domain.ai/
│   └── microservice.agents/
│       ├── app.ts
│       ├── moleculer.config.ts
│       ├── package.json
│       ├── db/
│       │   ├── index.ts
│       │   ├── historicalAnalysis.table.ts
│       │   ├── predictionReport.table.ts
│       │   └── aiMessageHistory.table.ts  # AI agent message history
│       ├── services/
│       │   ├── historicalAgent/
│       │   │   ├── run.event.ts          # (internal event handler)
│       │   │   └── completed.event.ts    # (internal event emitter)
│       │   ├── newsAgent/
│       │   │   ├── run.event.ts          # (internal event handler)
│       │   │   └── completed.event.ts    # (internal event emitter)
│       │   ├── predictionAgent/
│       │   │   ├── run.event.ts          # (internal event handler)
│       │   │   └── completed.event.ts    # (internal event emitter)
│       │   ├── prediction/
│       │   │   ├── index.ts              # settings.rest: "/predictions"
│       │   │   ├── list.action.ts        # rest: "GET /sessions/:sessionId"
│       │   │   ├── latest.action.ts      # rest: "GET /sessions/:sessionId/latest"
│       │   │   └── get.action.ts         # rest: "GET /:id"
│       │   ├── historicalAnalysis/
│       │   │   ├── index.ts              # settings.rest: "/historical-analysis"
│       │   │   └── get.action.ts         # rest: "GET /sessions/:sessionId"
│       │   └── aiHistory/
│       │       ├── index.ts              # settings.rest: "/ai-history"
│       │       ├── list.action.ts        # rest: "GET /sessions/:sessionId"
│       │       ├── get.action.ts         # rest: "GET /:id"
│       │       ├── listByRun.action.ts   # rest: "GET /runs/:runId"
│       │       └── stats.action.ts       # rest: "GET /stats"
│       └── __generated__/
└── domain.scheduler/
    └── microservice.scheduler/
        ├── app.ts
        ├── moleculer.config.ts
        ├── package.json
        ├── db/
        │   ├── index.ts
        │   └── dailyRunLog.table.ts
        ├── services/
        │   └── scheduler/
        │       ├── index.ts              # settings.rest: "/scheduler"
        │       ├── run.action.ts             # rest: "POST /sessions/:sessionId/run"
        │       ├── status.action.ts          # rest: "GET /status"
        │       ├── listRuns.action.ts        # rest: "GET /sessions/:sessionId/runs"
        │       ├── getRun.action.ts          # rest: "GET /runs/:runId"
        │       ├── agentCompleted.event.ts   # (internal event handler)
        │       ├── pipelineTimeout.event.ts  # (internal event handler)
        │       ├── dailyJob.ts               # Agenda job definition
        │       └── timeoutChecker.ts         # Agenda timeout checker job
        └── __generated__/
```

**Structure Decision**: Microservices monorepo following constitution. Four domains:
- `domain.analysis` - Session management
- `domain.data` - Stock and news data collection
- `domain.ai` - AI agents for analysis (event-driven)
- `domain.scheduler` - Daily job orchestration (emits events)

Adapters live in `lib/adapters/` as shared infrastructure.

## Event-Driven AI Agent Architecture

AI agents use **events** (asynchronous) instead of actions (synchronous) because AI inference can take significant time (30s-3min). This prevents blocking the scheduler and allows parallel processing.

### Event Flow

```
┌──────────────┐     emit      ┌───────────────────┐
│  Scheduler   │──────────────▶│ historicalAgent   │
│  (run job)   │               │   .run event      │
└──────────────┘               └─────────┬─────────┘
                                         │ process AI
                                         ▼
┌──────────────┐     emit      ┌───────────────────┐
│  Scheduler   │◀──────────────│ historicalAgent   │
│  (track)     │               │   .completed      │
└──────────────┘               └───────────────────┘
        │
        │ emit next
        ▼
┌───────────────────┐          ┌───────────────────┐
│   newsAgent.run   │─────────▶│ predictionAgent   │
│                   │  (after) │     .run          │
└───────────────────┘          └───────────────────┘
```

### Event Definitions

| Event | Payload | Description |
|-------|---------|-------------|
| `historicalAgent.run` | `{ sessionId, runId }` | Trigger historical data analysis |
| `historicalAgent.completed` | `{ sessionId, runId, success, analysisId? }` | Historical analysis done |
| `newsAgent.run` | `{ sessionId, runId }` | Trigger news summarization |
| `newsAgent.completed` | `{ sessionId, runId, success, summaryIds? }` | News summarization done |
| `predictionAgent.run` | `{ sessionId, runId }` | Trigger prediction generation |
| `predictionAgent.completed` | `{ sessionId, runId, success, reportId? }` | Prediction done |

### Benefits

1. **Non-blocking**: Scheduler doesn't wait for AI to complete
2. **Parallel**: Multiple agents can run concurrently (if independent)
3. **Resilient**: Events can be retried, logged, and monitored
4. **Scalable**: Multiple agent instances can handle events via load balancing (`group`)

## Pipeline Timeout Handling

Since AI agents run asynchronously via events, the scheduler must handle timeouts to prevent stuck pipelines when agents crash or hang.

### Timeout Configuration

Each session has a configurable `pipelineTimeoutMinutes` (default: 10 min, max: 60 min) stored in the database. When a run starts, the scheduler calculates `timeoutAt = startedAt + pipelineTimeoutMinutes`.

### Timeout Detection

The scheduler runs a periodic job (every 1 minute) to check for timed-out runs:

```typescript
// scheduler/timeoutChecker.ts (Agenda job)
agenda.define('check-pipeline-timeouts', async () => {
  const timedOutRuns = await DailyRunLog.find({
    status: 'running',
    timeoutAt: { $lte: new Date() }
  });

  for (const run of timedOutRuns) {
    await DailyRunLog.updateOne(
      { _id: run._id },
      {
        status: 'timeout',
        completedAt: new Date(),
        timeoutReason: `Pipeline exceeded ${run.timeoutAt - run.startedAt}ms timeout. Last agent status: ${getLastAgentStatus(run)}`
      }
    );
    
    // Emit timeout event for cleanup/alerting
    await broker.emit('scheduler.pipelineTimeout', {
      sessionId: run.sessionId,
      runId: run._id,
      reason: 'timeout'
    });
  }
});

// Run every minute
agenda.every('1 minute', 'check-pipeline-timeouts');
```

### Timeout Flow

```
┌──────────────┐                    ┌───────────────────┐
│  Scheduler   │──── emit ────────▶│  agent.run event  │
│  creates run │                    └─────────┬─────────┘
│  timeoutAt = │                              │
│  now + 10min │                              │ agent crashes/hangs
└──────┬───────┘                              ▼
       │                            ┌───────────────────┐
       │ every 1 min                │   (no response)   │
       ▼                            └───────────────────┘
┌──────────────┐
│ Timeout      │     if now > timeoutAt && status == 'running'
│ Checker Job  │────────────────────────────────────────────▶ Mark TIMEOUT
└──────────────┘
```

### Updated Event Definitions

| Event | Payload | Description |
|-------|---------|-------------|
| `scheduler.pipelineTimeout` | `{ sessionId, runId, reason }` | Pipeline timed out (for alerting/cleanup) |

### Session API Update

```typescript
// Update timeout via API
PUT /sessions/{sessionId}/timeout
{
  "pipelineTimeoutMinutes": 15  // 1-60 minutes
}
```

## Complexity Tracking

> No violations - table not needed
