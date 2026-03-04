# Data Analysis Platform

A microservice-based **agentic data analysis** platform built with [Moleculer](https://moleculer.services/) and TypeScript. Upload datasets (CSV, PDF, XLSM), manage analysis sessions and conversations, and interact with your data through an AI-powered chat interface that orchestrates 24+ analysis tools automatically.

## Architecture

```
┌──────────────┐       ┌───────────────────┐       ┌───────────────────────┐
│   Frontend   │──────▶│  microservice.    │──────▶│  microservice.        │
│  (Next.js)   │  HTTP │  proxy (gateway)  │ NATS  │  analysis             │
│  port 4000   │       │                   │──────▶│  (sessions, chat, AI) │
└──────────────┘       └───────────────────┘       └───────────────────────┘
                                                          │
                                                          ▼
                                                   ┌──────────────────┐
                                                   │  PostgreSQL 16+  │
                                                   │  + pgvector      │
                                                   └──────────────────┘
```

| Component | Description |
|-----------|-------------|
| **Frontend** | Next.js 16 app with React Query, Markdown rendering |
| **microservice.proxy** | API gateway (moleculer-web), routes HTTP to internal services |
| **microservice.analysis** | Session & conversation management, AI chat orchestration |
| **core.lib** | Shared library — broker, config, adapters, codegen, database |

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Microservices:** Moleculer with auto-generated type-safe service calls
- **Frontend:** Next.js 16 / React 19 / React Query
- **Database:** PostgreSQL 16+ with pgvector for embeddings
- **AI:** Ollama (local) / Google Gemini adapters
- **File Parsing:** CSV (PapaParse), PDF (pdf-parse), XLSM (xlsx)
- **Linting:** Biome

## Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL 16+** with pgvector extension
- **Ollama** (for local AI) or a Gemini API key

```bash
# Quick PostgreSQL setup with Docker
docker run -d \
  --name pgvector \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment — copy .env.example to .env in each microservice
#    and set database credentials, AI provider keys, etc.

# 3. Generate type-safe service call types
npm run generate:types:all

# 4. Start a microservice in development mode
npm run dev -w microservice.analysis

# 5. Start the frontend
npm run dev -w frontend
```

The frontend runs on **http://localhost:4000** by default.

## Project Structure

```
├── lib/                        # Shared core library (core.lib)
│   ├── broker/                 #   createApp, defineAction, defineEvent, run
│   ├── config/                 #   Configuration system & env presets
│   ├── adapters/               #   AI (Ollama/Gemini) & file-parser adapters
│   ├── database/               #   TypeORM DataSource factory & shared entities
│   └── codegen/                #   Type generation for typed ctx.call()
├── apps/
│   ├── domain.analysis/
│   │   └── microservice.analysis/   # Sessions, conversations, AI chat
│   ├── domain.example/
│   │   └── microservice.example/    # Reference / starter microservice
│   └── domain.platform/
│       └── microservice.proxy/      # API gateway
├── frontend/                   # Next.js frontend
├── docs/                       # Documentation
│   ├── api/api.yaml            # OpenAPI 3.0 specification
│   └── domain-knowledge/       # Feature-specific docs with diagrams
└── scripts/                    # Build, codegen, and utility scripts
```

Each microservice follows the convention:

```
microservice.{name}/
├── app.ts                  # Entry point
├── moleculer.config.ts     # Config
├── db/                     # TypeORM entities & query objects
├── services/
│   └── {serviceName}/
│       ├── {name}.action.ts    # → serviceName.name
│       └── {name}.event.ts     # → serviceName.name
└── __generated__/          # Auto-generated types (git-ignored)
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm install` | Install all workspace dependencies |
| `npm run generate:types:all` | Generate types for all microservices |
| `npm run generate:types` | Generate types for a single microservice |
| `npm run init:microservice -- <domain> <name> [services]` | Scaffold a new microservice |
| `npm run lint` | Check code with Biome |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format code with Biome |
| `npm run db:clear` | Clear the database |

## Creating a New Microservice

```bash
# Scaffold with init script
npm run init:microservice -- payment payment transaction,refund

# Install & generate types
npm install
npm run generate:types:all

# Start development
npm run dev -w microservice.payment
```

See [docs/creating-services.md](docs/creating-services.md) for the full guide.

## Configuration

Configuration is merged in order: **defaults → environment presets → service config → env variables**.

Key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | — | `development` / `staging` / `production` |
| `TRANSPORTER` | `null` | Moleculer transporter URL (e.g. `nats://localhost:4222`) |
| `LOG_LEVEL` | `info` | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | `postgres` | Database password |
| `POSTGRES_DB` | — | Database name per microservice |

See [docs/configuration.md](docs/configuration.md) for the full reference.

## Documentation

| Document | Description |
|----------|-------------|
| [Project Structure](docs/project-structure.md) | Codebase overview and conventions |
| [Core Library](docs/core-library.md) | `core.lib` API reference |
| [Creating Services](docs/creating-services.md) | Guide to adding microservices and actions |
| [Configuration](docs/configuration.md) | Config system and environment variables |
| [Type Generation](docs/type-generation.md) | How typed `ctx.call()` works |
| [Database](docs/database.md) | PostgreSQL / TypeORM setup and patterns |
| [API Spec](docs/api/api.yaml) | OpenAPI 3.0 REST API specification |

## License

Private — all rights reserved.
