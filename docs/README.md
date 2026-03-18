# Documentation

This folder contains documentation for the Moleculer TypeScript Microservices project.

## Quick Start

```bash
# Create a new microservice
npm run init:microservice -- <domain> <microservice> [services]

# Install dependencies
npm install

# Generate types
npm run generate:types:all

# Start development
npm run dev -w microservice.{name}
```

## Contents

### Core Documentation

- [Project Structure](./project-structure.md) - Overview of the codebase structure
- [Core Library](./core-library.md) - Documentation for the shared `core.lib` package
- [Creating Services](./creating-services.md) - Guide to creating new microservices and actions
- [Configuration](./configuration.md) - Configuration system and environment variables
- [Type Generation](./type-generation.md) - How type-safe service calls work
- [Database](./database.md) - PostgreSQL/TypeORM setup and conventions
- [Testing](./testing.md) - Jest testing guide and patterns

### Domain Knowledge

Feature-specific documentation with architecture diagrams:

- [Architecture Overview](./domain-knowledge/architecture-overview.md) - Microservice topology, service registry, database schema
- [Session Management](./domain-knowledge/session-management.md) - Session lifecycle and status transitions
- [Conversation Management](./domain-knowledge/conversation-management.md) - Conversation CRUD and system prompt construction
- [Chat System](./domain-knowledge/chat-system.md) - AI tool-calling orchestration, message protocol
- [Chat Streaming](./domain-knowledge/chat-streaming.md) - Real-time chat streaming implementation
- [Dataset Events](./domain-knowledge/dataset-events.md) - Cross-service event flow for uploads and metadata
- [Tool Configuration](./domain-knowledge/tool-configuration.md) - Centralized tool registry, enabling/disabling tools
- [Document Summarization](./domain-knowledge/document-summarization.md) - Map-reduce summarization for large documents
- [Text Chunking](./domain-knowledge/text-chunking.md) - LangChain text splitting with word-boundary awareness
- [Hybrid Semantic Search](./domain-knowledge/hybrid-semantic-search.md) - Vector similarity search with pgvector
- [Gemini Adapter](./domain-knowledge/gemini-adapter.md) - Google Gemini AI integration and tool-calling flow
- [AI Logging](./domain-knowledge/ai-logging.md) - Audit trail for all AI interactions
- [AI Naming](./domain-knowledge/ai-naming.md) - AI-generated naming conventions
- [Agent Self-Reflection](./domain-knowledge/agent-self-reflection.md) - Agent self-reflection patterns
- [Sub-Agent Delegation](./domain-knowledge/sub-agent-delegation.md) - Sub-agent delegation patterns
- [URL & Web Search Import](./domain-knowledge/url-and-web-search-import.md) - URL import and web search features
- [XLSM Parsing](./domain-knowledge/xlsm-parsing.md) - Excel parsing with merged cells and multi-row headers
- [Numeric Comma Handling](./domain-knowledge/numeric-comma-handling.md) - European/Vietnamese comma-decimal format support
- [Timezone Handling](./domain-knowledge/timezone-handling.md) - UTC enforcement to prevent double-offset bugs
- [Query Param Validation](./domain-knowledge/query-param-validation.md) - Type coercion for HTTP query parameters
- [Jaeger Tracing](./domain-knowledge/jaeger-tracing.md) - Distributed tracing setup and integration

### API Reference

- [OpenAPI Specification](./api/api.yaml) - Full REST API documentation (OpenAPI 3.0)

