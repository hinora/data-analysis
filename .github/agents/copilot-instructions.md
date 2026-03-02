# data-analysis Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-27

## Active Technologies

- TypeScript 5.x, Node.js 20 LTS (strict mode) + Moleculer 0.14.x (microservice framework), TypeORM 0.3.x (ORM), pgvector (vector similarity), Ollama/Gemini (AI providers), pdf-parse (PDF text), tabula-js (PDF tables, requires JRE 8+), xlsx/SheetJS (XLSM), papaparse (CSV), nomic-embed-text (embeddings via Ollama) (001-agentic-data-analysis)
- PostgreSQL 16+ via TypeORM — one database per microservice; pgvector extension for vector embeddings; local filesystem for original files (001-agentic-data-analysis)

## Project Structure

```text
lib/                    # Shared core library (core.lib)
apps/domain.*/          # Microservices per domain
frontend/               # Next.js frontend
docs/                   # Project documentation (source of truth)
specs/                  # Feature specifications and plans
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x, Node.js 20 LTS (strict mode): Follow standard conventions

## Recent Changes

- 001-agentic-data-analysis: Added TypeScript 5.x, Node.js 20 LTS (strict mode) + Moleculer 0.14.x (microservice framework), TypeORM 0.3.x (ORM), pgvector (vector similarity), Ollama/Gemini (AI providers), pdf-parse (PDF text), tabula-js (PDF tables, requires JRE 8+), xlsx/SheetJS (XLSM), papaparse (CSV), nomic-embed-text (embeddings via Ollama)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
