<!--
  Sync Impact Report
  ==================================================
  Version change: 1.0.0 → 1.1.0 (MINOR — added documentation
  references, code style section, developer guidance linkage)
  Modified principles:
    - I. Microservice Architecture: added docs reference for
      project-structure.md, creating-services.md
    - IV. Adapter-First Integration: added docs reference for
      core-library.md, configuration.md
  Added sections:
    - Documentation Authority (new section between principles
      and tech stack)
    - Code Style & Conventions (new section)
  Removed sections: None
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ compatible
    - .specify/templates/spec-template.md ✅ compatible
    - .specify/templates/tasks-template.md ✅ compatible
    - .specify/templates/checklist-template.md ✅ compatible
    - .specify/templates/agent-file-template.md ✅ compatible
  Follow-up TODOs: None
  ==================================================
-->

# Agentic AI Data Analysis Platform Constitution

## Core Principles

### I. Microservice Architecture

- Every domain MUST reside in its own microservice under
  `apps/domain.{name}/microservice.{name}/`.
- Services MUST be stateless; persistent state MUST live in PostgreSQL
  with a dedicated database per microservice.
- All shared logic (adapters, broker utilities, codegen, config,
  database helpers) MUST be placed in `lib/` and imported as
  `core.lib` or its subpath exports (e.g., `core.lib/broker`).
- New microservices MUST be scaffolded via
  `npm run init:microservice` to ensure consistent structure.
- Internal service-to-service communication MUST use Moleculer
  actions (`ctx.call`) or events (`ctx.emit`), never direct HTTP.
- HTTP REST endpoints MUST only be exposed through the API Gateway
  (`domain.platform/microservice.proxy`).
- Actions MUST use `defineAction`; events MUST use `defineEvent`.
  Complex actions MUST be split into smaller actions or service
  methods.
- Actions are classified as **external** (with `rest` property,
  HTTP-accessible) or **internal** (no `rest`, service-to-service
  only). Both are callable via `ctx.call()`.

**Reference docs**: `docs/project-structure.md`,
`docs/creating-services.md`.

**Rationale**: Domain isolation reduces blast radius, enables
independent deployment, and keeps cognitive load per service low.

### II. Data Integrity & Provenance

- Every ingested data record (file upload, API fetch, AI output)
  MUST include: source identifier, original format, import
  timestamp, and a hash or fingerprint where applicable.
- User-uploaded files (PDF, CSV, XLSM) MUST be stored in their
  original form alongside any parsed/transformed representation.
- Numeric and date values MUST preserve the precision and timezone
  of the original source; no silent rounding or coercion.
- Duplicate detection MUST be performed before insertion; duplicates
  are skipped silently without error.
- News articles and external content MUST retain original
  publication date, source URL, and fetch timestamp.

**Rationale**: Trustworthy analysis requires an auditable chain
from raw input to final insight. Users MUST be able to verify
that conclusions trace back to concrete data.

### III. AI Guardrails

- Each AI agent MUST declare its analysis scope (what it can and
  cannot answer) before execution.
- All AI outputs MUST include a confidence score (0–1) and MUST
  cite the data sources used to produce the result.
- Recommendations MUST be accompanied by supporting reasoning that
  references specific data points.
- External API calls MUST be rate-limited to a maximum of 100
  requests per minute per adapter.
- Failed external calls MUST retry with exponential backoff up to
  a maximum of 3 retries.
- AI agent prompts and responses MUST be logged to enable
  reproducibility audits and debugging.
- AI-generated content MUST carry a disclaimer stating it is
  machine-generated and not financial or professional advice.

**Rationale**: Agentic AI operates with significant autonomy;
guardrails ensure outputs are explainable, reproducible, and do
not mislead users.

### IV. Adapter-First Integration

- Every external dependency (AI providers, data sources, file
  parsers, news APIs) MUST be accessed through an adapter that
  implements a shared interface in `lib/adapters/`.
- Swapping a provider (e.g., Ollama → Gemini, Yahoo → Alpha
  Vantage) MUST require only configuration changes and a new
  adapter implementation — zero changes to service code.
- Adapters for file ingestion MUST support at minimum: PDF, CSV,
  and XLSM formats; additional formats SHOULD be addable without
  modifying existing adapters.
- Configuration hierarchy MUST follow:
  `defaultConfig → environment preset → service config → env vars`.
  See `docs/configuration.md` for details.

**Reference docs**: `docs/core-library.md`,
`docs/configuration.md`.

**Rationale**: Adapter isolation makes provider changes a
configuration concern, not a refactoring effort, and keeps
services testable with mocks.

### V. Test-First Development

- Tests MUST be written before implementation (Red-Green-Refactor).
- External APIs and AI providers MUST be mocked in unit and
  integration tests; no live network calls in CI.
- Each user story MUST be independently testable — implementing a
  single story MUST yield a viable, demonstrable increment.
- Integration tests are required for: new service contracts,
  contract changes, inter-service communication, and shared
  schema modifications.

**Rationale**: Test-first catches design flaws early and
guarantees that every delivered increment is verifiably correct.

### VI. Observability & Traceability

- All services MUST emit structured JSON logs with correlation IDs
  (provided by Moleculer's request tracking).
- AI agent reasoning steps, prompt tokens, and response tokens
  MUST be captured in a `DailyRunLog` or equivalent audit entity.
- Errors MUST be logged with sufficient context (service name,
  action, params snapshot) to reproduce the issue without
  additional investigation.
- Long-running operations (AI inference, file parsing) MUST report
  progress or heartbeat so the scheduler can detect stalls.

**Rationale**: Distributed microservices and autonomous AI agents
are impossible to debug without rich, correlated telemetry.

## Documentation Authority

The `docs/` folder is the single source of truth for project
knowledge. All developers (human and AI) MUST consult these
before implementation:

| Document | Purpose |
|----------|---------|
| `docs/project-structure.md` | Folder layout, naming conventions, workspace config |
| `docs/core-library.md` | `core.lib` modules: broker, config, moleculer exports |
| `docs/creating-services.md` | Scaffolding microservices, actions, events, validation |
| `docs/configuration.md` | Config hierarchy, env vars, environment presets |
| `docs/type-generation.md` | Codegen for type-safe `ctx.call()` and `ctx.emit()` |
| `docs/database.md` | PostgreSQL/TypeORM setup, table file conventions, queries |
| `docs/domain-knowledge/` | Feature-specific architecture and data-flow diagrams |
| `docs/api/api.yaml` | OpenAPI 3.0 spec for all REST endpoints |

### Developer Guidance Files

Two agent files provide **binding** coding standards. They
supplement this constitution with implementation-level rules:

- **`.github/agents/ai-developer.agent.md`** — Backend (Moleculer
  microservices). Covers `defineAction`/`defineEvent` usage,
  REST URL conventions, authentication patterns, code style
  (named imports/exports, alphabetical ordering, single-object
  params, strict types, error classes, parallel async). After
  every implementation session: run type generation, run
  `npm run lint:fix`, update OpenAPI if REST endpoints changed,
  update `docs/domain-knowledge/` docs.
- **`.github/agents/ai-developer-frontend.agent.md`** — Frontend
  (Next.js). Covers React Query hooks (query/mutation templates),
  component structure (functional only, TypeScript props, pass
  IDs and fetch inside), hook destructuring rules, mutation
  callback conventions, file organization. After every session:
  run `npm run lint:fix`.

When this constitution and a developer guidance file conflict,
**this constitution takes precedence**.

## Technology Stack & Constraints

- **Runtime**: Node.js 20 LTS, TypeScript 5.x (strict mode).
- **Microservice Framework**: Moleculer 0.14.x with NATS or
  TCP transporter.
- **Database**: PostgreSQL 16+ via TypeORM 0.3.x with pgvector;
  one database per microservice.
- **AI Providers**: Ollama (default/local), Gemini (cloud);
  selectable via environment variable `AI_PROVIDER`.
- **File Parsing**: Dedicated adapters per format (PDF, CSV, XLSM)
  in `lib/adapters/file-parser/`.
- **Frontend**: Next.js (React) communicating exclusively through
  the API Gateway.
- **Monorepo**: npm workspaces — `lib` + `apps/*/*`.
- **Linting/Formatting**: Biome.
- **Performance Targets**: p95 < 500 ms for API endpoints; agent
  analysis < 3 minutes per session.
- **Rate Limits**: Max 100 requests/minute to any single external
  API per adapter.
- **Retry Policy**: Max 3 retries with exponential backoff
  (100 ms base, 2x factor, 1 s cap).

## Code Style & Conventions

These rules apply to all TypeScript code in the repository.
Full details live in the developer guidance files referenced
above.

- **Imports/Exports**: named only. No default exports, no
  `import *`. Sole exception: `defineAction`/`defineEvent`
  default exports in action/event files (framework convention).
- **Function signatures**: single-object parameter pattern.
  Exception: simple utilities (`max(a, b)`).
- **Ordering**: alphabetical for object properties, interface
  members, enum values, class methods. Exception: `Promise.all`
  destructure order.
- **Naming**: `camelCase` functions (verb-prefixed), `PascalCase`
  classes/interfaces (no `I` prefix), `UPPER_SNAKE_CASE`
  constants, `is/has/can/should` boolean prefixes.
- **Strict types**: `any` is forbidden; use `unknown` + type
  guards.
- **Async**: use `Promise.all()` for independent operations;
  sequential only when dependent.
- **Errors**: custom error classes with context; never bare
  `throw new Error('...')`.
- **JSDoc**: no `{Type}` annotations — TypeScript handles types.
- **REST URLs**: RESTful conventions (`GET /`, `GET /:id`,
  `POST /`, `PUT /:id`, `DELETE /:id`). Service-level `rest`
  setting defines the base path.
- **Frontend hooks**: destructure mutation hooks; use callbacks
  (not async/await) in `onSuccess`. Pass IDs as props, fetch
  data inside components via React Query.

## Development Workflow

1. **Scaffold** — use `npm run init:microservice` for new domains.
2. **Design** — write or update the feature spec in `specs/` using
   the spec template; define contracts in OpenAPI YAML.
3. **Plan** — produce a plan with a Constitution Check gate that
   MUST pass before implementation begins.
4. **Implement** — follow Test-First (Principle V); generate types
   with `npm run generate:types:all` after adding actions.
5. **Post-implement** — run `npm run lint:fix`; update OpenAPI
   spec (`docs/api/api.yaml`) if REST endpoints changed; update
   or create `docs/domain-knowledge/` docs for the feature.
6. **Review** — all PRs MUST verify compliance with this
   constitution; reviewers MUST check the Constitution Check table.
7. **Ship** — merge to main; deploy per environment config
   (development → staging → production).

## Governance

- This constitution supersedes all other development practices
  within the repository. In case of conflict, the constitution
  wins.
- Amendments MUST be documented with a version bump, rationale,
  and migration plan for any affected in-flight work.
- Versioning follows Semantic Versioning: MAJOR for
  backward-incompatible governance changes, MINOR for new
  principles or materially expanded guidance, PATCH for
  clarifications and typo fixes.
- Every implementation plan MUST include a Constitution Check gate
  table verifying compliance with each principle before Phase 0
  research begins.
- Complexity beyond what the constitution prescribes MUST be
  explicitly justified in the plan's Complexity Tracking section.
- Developer guidance files
  (`.github/agents/ai-developer.agent.md` for backend,
  `.github/agents/ai-developer-frontend.agent.md` for frontend)
  contain binding implementation-level rules that supplement
  this constitution.
- The `docs/` folder is the authoritative reference for project
  knowledge; changes to architecture or conventions MUST be
  reflected there.

**Version**: 1.1.0 | **Ratified**: 2026-02-25 | **Last Amended**: 2026-02-25
