# Tasks: AI Stock Analysis System

**Input**: Design documents from `/specs/001-ai-stock-analysis/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not included (not explicitly requested in specification)

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, etc.)
- Include exact file paths in descriptions

## Path Conventions

- **Adapters**: `lib/adapters/`
- **Microservices**: `apps/domain.{name}/microservice.{name}/`
- **Database schemas**: `{microservice}/db/`
- **Services**: `{microservice}/services/{service}/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, adapters, and shared infrastructure in lib/

- [X] T001 Create AI adapter interface and types in lib/adapters/ai/types.ts
- [X] T002 [P] Implement Ollama adapter in lib/adapters/ai/ollama.adapter.ts
- [X] T003 [P] Create AI adapter factory in lib/adapters/ai/index.ts
- [X] T004 [P] Create stock data adapter interface and types in lib/adapters/stock-data/types.ts
- [X] T005 [P] Implement Yahoo Finance adapter in lib/adapters/stock-data/yahoo.adapter.ts
- [X] T006 [P] Create stock data adapter factory in lib/adapters/stock-data/index.ts
- [X] T007 [P] Create news adapter interface and types in lib/adapters/news/types.ts
- [X] T008 [P] Implement NewsAPI.org adapter in lib/adapters/news/newsapi.adapter.ts
- [X] T009 [P] Implement Finnhub News adapter in lib/adapters/news/finnhub.adapter.ts
- [X] T010 [P] Implement Reddit adapter in lib/adapters/news/reddit.adapter.ts
- [X] T011 [P] Implement RSS adapter in lib/adapters/news/rss.adapter.ts
- [X] T012 [P] Create news adapter factory in lib/adapters/news/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Initialize all microservices and database schemas

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T013 Initialize microservice.session via npm run init:microservice -- analysis session
- [X] T014 Initialize microservice.stock via npm run init:microservice -- data stock
- [X] T015 Initialize microservice.news via npm run init:microservice -- data news
- [X] T016 Initialize microservice.agents via npm run init:microservice -- ai agents
- [X] T017 Initialize microservice.scheduler via npm run init:microservice -- scheduler scheduler
- [X] T018 [P] Create Session schema in apps/domain.analysis/microservice.session/db/session.table.ts
- [X] T019 [P] Create HistoricalStockData schema in apps/domain.data/microservice.stock/db/historicalStockData.table.ts
- [X] T020 [P] Create NewsItem schema in apps/domain.data/microservice.news/db/newsItem.table.ts
- [X] T021 [P] Create NewsSummary schema in apps/domain.data/microservice.news/db/newsSummary.table.ts
- [X] T022 [P] Create HistoricalAnalysis schema in apps/domain.ai/microservice.agents/db/historicalAnalysis.table.ts
- [X] T023 [P] Create PredictionReport schema in apps/domain.ai/microservice.agents/db/predictionReport.table.ts
- [X] T024 [P] Create AIMessageHistory schema in apps/domain.ai/microservice.agents/db/aiMessageHistory.table.ts
- [X] T025 [P] Create DailyRunLog schema in apps/domain.scheduler/microservice.scheduler/db/dailyRunLog.table.ts
- [X] T026 [P] Create database index exports in each microservice's db/index.ts
- [X] T027 Run npm run generate:types:all to generate TypedContext for all services

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Create Analysis Session (Priority: P1) 🎯 MVP

**Goal**: Users can create, view, and manage analysis sessions for specific stocks

**Independent Test**: Create a session for NVDA, verify it's stored with correct status and company info

### Implementation for User Story 1

- [X] T028 [US1] Create session service index.ts with settings.rest: "/sessions" in apps/domain.analysis/microservice.session/services/session/index.ts
- [X] T029 [P] [US1] Implement session.create action in apps/domain.analysis/microservice.session/services/session/create.action.ts
- [X] T030 [P] [US1] Implement session.get action in apps/domain.analysis/microservice.session/services/session/get.action.ts
- [X] T031 [P] [US1] Implement session.list action in apps/domain.analysis/microservice.session/services/session/list.action.ts
- [X] T032 [P] [US1] Implement session.delete action in apps/domain.analysis/microservice.session/services/session/delete.action.ts
- [X] T033 [US1] Implement stock.validate action in apps/domain.data/microservice.stock/services/stock/validate.action.ts
- [X] T034 [US1] Create stock service index.ts with settings.rest: "/stocks" in apps/domain.data/microservice.stock/services/stock/index.ts
- [X] T035 [US1] Integrate stock validation into session creation (call stock.validate before creating)

**Checkpoint**: User Story 1 complete - sessions can be created, viewed, listed, deleted

---

## Phase 4: User Story 2 - Historical Stock Data Analysis (Priority: P1)

**Goal**: Historical Data Agent fetches and analyzes stock price data

**Independent Test**: Create session, trigger historical agent, verify data fetched and analysis generated

### Implementation for User Story 2

- [X] T036 [US2] Implement stock.fetch action (internal) in apps/domain.data/microservice.stock/services/stock/fetch.action.ts
- [X] T037 [US2] Implement stock.getHistory action in apps/domain.data/microservice.stock/services/stock/getHistory.action.ts
- [X] T038 [US2] Create historicalAgent service folder in apps/domain.ai/microservice.agents/services/historicalAgent/
- [X] T039 [US2] Implement historicalAgent.run event handler in apps/domain.ai/microservice.agents/services/historicalAgent/run.event.ts (log all AI messages to AIMessageHistory per FR-020)
- [X] T040 [US2] Implement historicalAgent.completed event emitter in apps/domain.ai/microservice.agents/services/historicalAgent/completed.event.ts
- [X] T041 [US2] Create historicalAnalysis service index.ts in apps/domain.ai/microservice.agents/services/historicalAnalysis/index.ts
- [X] T042 [US2] Implement historicalAnalysis.get action in apps/domain.ai/microservice.agents/services/historicalAnalysis/get.action.ts
- [X] T043 [US2] Add incremental fetch logic (skip dates already in database) in stock.fetch action

**Checkpoint**: User Story 2 complete - historical data fetched and analyzed

---

## Phase 5: User Story 3 - News Collection and Summarization (Priority: P2)

**Goal**: News Agent collects from multiple sources and generates summaries

**Independent Test**: Create session with NewsAPI enabled, trigger news agent, verify items collected and summarized

### Implementation for User Story 3

- [X] T044 [US3] Create news service index.ts with settings.rest: "/news" in apps/domain.data/microservice.news/services/news/index.ts
- [X] T045 [US3] Implement news.collect action (internal) in apps/domain.data/microservice.news/services/news/collect.action.ts
- [X] T046 [US3] Implement news.list action in apps/domain.data/microservice.news/services/news/list.action.ts
- [X] T047 [US3] Implement news.getSummaries action in apps/domain.data/microservice.news/services/news/getSummaries.action.ts
- [X] T048 [US3] Create newsAgent service folder in apps/domain.ai/microservice.agents/services/newsAgent/
- [X] T049 [US3] Implement newsAgent.run event handler in apps/domain.ai/microservice.agents/services/newsAgent/run.event.ts (log all AI messages to AIMessageHistory per FR-020)
- [X] T050 [US3] Implement newsAgent.completed event emitter in apps/domain.ai/microservice.agents/services/newsAgent/completed.event.ts
- [X] T051 [US3] Add duplicate detection logic (skip existing externalIds) in news.collect action

**Checkpoint**: User Story 3 complete - news collected and summarized

---

## Phase 6: User Story 4 - AI-Powered Stock Prediction (Priority: P2)

**Goal**: Prediction Agent combines historical and news data to generate predictions

**Independent Test**: Run prediction agent after historical and news complete, verify report generated with all sections

### Implementation for User Story 4

- [X] T052 [US4] Create predictionAgent service folder in apps/domain.ai/microservice.agents/services/predictionAgent/
- [X] T053 [US4] Implement predictionAgent.run event handler in apps/domain.ai/microservice.agents/services/predictionAgent/run.event.ts (log all AI messages to AIMessageHistory per FR-020)
- [X] T054 [US4] Implement predictionAgent.completed event emitter in apps/domain.ai/microservice.agents/services/predictionAgent/completed.event.ts
- [X] T055 [US4] Create prediction service index.ts in apps/domain.ai/microservice.agents/services/prediction/index.ts
- [X] T056 [P] [US4] Implement prediction.list action in apps/domain.ai/microservice.agents/services/prediction/list.action.ts
- [X] T057 [P] [US4] Implement prediction.latest action in apps/domain.ai/microservice.agents/services/prediction/latest.action.ts
- [X] T058 [P] [US4] Implement prediction.get action in apps/domain.ai/microservice.agents/services/prediction/get.action.ts
- [X] T059 [US4] Add disclaimer text to all prediction reports per FR-040

**Checkpoint**: User Story 4 complete - AI predictions generated with reasoning and disclaimers

---

## Phase 7: User Story 7 - Daily Scheduled Agent Execution (Priority: P1)

**Goal**: Agents run automatically daily in sequence: Historical → News → Prediction

**Independent Test**: Enable daily scheduling, verify agents run automatically at scheduled time

### Implementation for User Story 7

- [X] T060 [US7] Create scheduler service index.ts in apps/domain.scheduler/microservice.scheduler/services/scheduler/index.ts
- [X] T061 [US7] Implement scheduler.run action in apps/domain.scheduler/microservice.scheduler/services/scheduler/run.action.ts
- [X] T062 [US7] Implement scheduler.status action in apps/domain.scheduler/microservice.scheduler/services/scheduler/status.action.ts
- [X] T063 [US7] Implement scheduler.listRuns action in apps/domain.scheduler/microservice.scheduler/services/scheduler/listRuns.action.ts
- [X] T064 [US7] Implement scheduler.getRun action in apps/domain.scheduler/microservice.scheduler/services/scheduler/getRun.action.ts
- [X] T065 [US7] Create Agenda job definition for daily runs in apps/domain.scheduler/microservice.scheduler/services/scheduler/dailyJob.ts
- [X] T066 [US7] Implement agentCompleted event handler in apps/domain.scheduler/microservice.scheduler/services/scheduler/agentCompleted.event.ts
- [X] T067 [US7] Implement sequential agent triggering (Historical → News → Prediction) in agentCompleted handler
- [X] T068 [US7] Create timeout checker job in apps/domain.scheduler/microservice.scheduler/services/scheduler/timeoutChecker.ts
- [X] T069 [US7] Implement pipelineTimeout event handler in apps/domain.scheduler/microservice.scheduler/services/scheduler/pipelineTimeout.event.ts
- [X] T070 [US7] Add concurrent execution prevention (skip if session already running)

**Checkpoint**: User Story 7 complete - daily scheduling working with timeout handling

---

## Phase 8: User Story 8 - Configure Daily Scheduling per Session (Priority: P2)

**Goal**: Users can enable/disable daily scheduling and set custom times per session

**Independent Test**: Toggle scheduling via API, verify session included/excluded from daily runs

### Implementation for User Story 8

- [X] T071 [US8] Implement session.updateSchedule action in apps/domain.analysis/microservice.session/services/session/updateSchedule.action.ts
- [X] T072 [US8] Implement session.updateNewsSources action in apps/domain.analysis/microservice.session/services/session/updateNewsSources.action.ts
- [X] T073 [US8] Implement session.updateTimeout action in apps/domain.analysis/microservice.session/services/session/updateTimeout.action.ts
- [X] T074 [US8] Update dailyJob to query only sessions with dailyScheduleEnabled=true
- [X] T075 [US8] Add per-session schedule time support in dailyJob (use session.scheduleTime or system default)

**Checkpoint**: User Story 8 complete - per-session scheduling configuration working

---

## Phase 9: User Story 5 - AI Provider Flexibility (Priority: P3)

**Goal**: Admin can switch AI providers via configuration without code changes

**Independent Test**: Change AI_PROVIDER env var, verify agents use new provider

### Implementation for User Story 5

- [X] T076 [US5] Add AI_PROVIDER environment variable support to lib/adapters/ai/index.ts
- [X] T077 [US5] Add fallback to Ollama when configured provider unavailable
- [X] T078 [US5] Add error message for invalid AI provider configuration
- [X] T079 [P] [US5] Implement Gemini adapter stub in lib/adapters/ai/gemini.adapter.ts (future)

**Checkpoint**: User Story 5 complete - AI provider can be switched via config

---

## Phase 10: User Story 6 - View and Manage Sessions (Priority: P3)

**Goal**: Users can view session list with status, access completed analyses, delete sessions

**Independent Test**: Create multiple sessions, verify list shows correct statuses, delete works

### Implementation for User Story 6

- [X] T080 [US6] Create aiHistory service index.ts in apps/domain.ai/microservice.agents/services/aiHistory/index.ts
- [X] T081 [P] [US6] Implement aiHistory.list action in apps/domain.ai/microservice.agents/services/aiHistory/list.action.ts
- [X] T082 [P] [US6] Implement aiHistory.get action in apps/domain.ai/microservice.agents/services/aiHistory/get.action.ts
- [X] T083 [P] [US6] Implement aiHistory.listByRun action in apps/domain.ai/microservice.agents/services/aiHistory/listByRun.action.ts
- [X] T084 [P] [US6] Implement aiHistory.stats action in apps/domain.ai/microservice.agents/services/aiHistory/stats.action.ts
- [X] T085 [US6] Update session.delete to cascade delete all associated data (historical, news, analyses, runs)

**Checkpoint**: User Story 6 complete - full session management with cascading delete

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple user stories

- [X] T086 [P] Add structured logging with correlation IDs to all agents
- [X] T087 [P] Add rate limiting to external API calls (100 req/min per constitution)
- [X] T088 [P] Add exponential backoff retry logic (max 3 retries) to all adapters
- [X] T089 [P] Configure environment variables for all services (.env files)
- [X] T090 Run quickstart.md validation to verify development setup works
- [X] T091 Update API Gateway (microservice.proxy) to auto-discover new services

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
     │
     ▼
Phase 2 (Foundational) ─── BLOCKS all user stories
     │
     ├──────────────────┬──────────────────┬──────────────────┐
     ▼                  ▼                  ▼                  ▼
Phase 3 (US1)      Phase 4 (US2)     Phase 7 (US7)     Phase 9 (US5)
Create Session     Historical Agent   Daily Scheduler   AI Flexibility
     │                  │                  │
     │                  ▼                  ▼
     │             Phase 5 (US3)     Phase 8 (US8)
     │             News Agent        Schedule Config
     │                  │
     │                  ▼
     │             Phase 6 (US4)
     │             Prediction Agent
     │                  │
     └──────────────────┴──────────────────┐
                                           ▼
                                    Phase 10 (US6)
                                    Session Management
                                           │
                                           ▼
                                    Phase 11 (Polish)
```

### User Story Dependencies

- **US1 (Create Session)**: Foundation only - can start immediately after Phase 2
- **US2 (Historical Agent)**: Depends on US1 (needs session to analyze)
- **US3 (News Agent)**: Depends on US1 (needs session with news sources)
- **US4 (Prediction Agent)**: Depends on US2 + US3 (needs both analyses)
- **US5 (AI Flexibility)**: Foundation only - can run in parallel with US1
- **US6 (Session Management)**: Depends on US1-US4 (needs full data to delete)
- **US7 (Daily Scheduler)**: Depends on US2 + US3 + US4 (orchestrates all agents)
- **US8 (Schedule Config)**: Depends on US7 (configures scheduler)

### Parallel Opportunities per Phase

**Phase 1 (Setup)**:
```
T002, T003, T004, T005, T006 ─── in parallel (different files)
T007, T008, T009, T010, T011, T012 ─── in parallel (different files)
```

**Phase 2 (Foundational)**:
```
T018, T019, T020, T021, T022, T023, T024, T025 ─── in parallel (db schemas)
```

**Phase 3-10 (User Stories)**:
- Tasks marked [P] within each phase can run in parallel
- Different user stories can be worked on by different developers if story dependencies are met

---

## Implementation Strategy

### MVP Scope (Recommended First Delivery)

**MVP = Phase 1 + Phase 2 + Phase 3 (US1) + Phase 4 (US2)**

This delivers:
- Adapters for AI, stock data, and news
- Session creation with stock validation
- Historical data fetching and analysis

User can create a session and see historical analysis - core value demonstrated.

### Incremental Delivery

1. **MVP**: US1 + US2 (Create session, historical analysis)
2. **+News**: US3 (Add news collection and summarization)
3. **+Predictions**: US4 (Add AI predictions)
4. **+Automation**: US7 + US8 (Add daily scheduling)
5. **+Polish**: US5 + US6 (AI flexibility, session management)

---

## Summary

| Phase | User Story | Priority | Tasks | Parallel |
|-------|-----------|----------|-------|----------|
| 1 | Setup | - | T001-T012 | 11 of 12 |
| 2 | Foundational | - | T013-T027 | 9 of 15 |
| 3 | US1: Create Session | P1 | T028-T035 | 4 of 8 |
| 4 | US2: Historical Agent | P1 | T036-T043 | 0 of 8 |
| 5 | US3: News Agent | P2 | T044-T051 | 0 of 8 |
| 6 | US4: Prediction Agent | P2 | T052-T059 | 2 of 8 |
| 7 | US7: Daily Scheduler | P1 | T060-T070 | 0 of 11 |
| 8 | US8: Schedule Config | P2 | T071-T075 | 0 of 5 |
| 9 | US5: AI Flexibility | P3 | T076-T079 | 1 of 4 |
| 10 | US6: Session Management | P3 | T080-T085 | 4 of 6 |
| 11 | Polish | - | T086-T091 | 4 of 6 |

**Total Tasks**: 91
**MVP Tasks**: 35 (Phases 1-4)
**Parallel Opportunities**: 35 tasks can run in parallel within their phases
