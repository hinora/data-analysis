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
- [Database](./database.md) - MongoDB/Mongoose setup and conventions

### Domain Knowledge

Feature-specific documentation with architecture diagrams:

- [AI Stock Analysis](./domain-knowledge/ai-stock-analysis.md) - System overview, data flow, and architecture
- [AI Agents](./domain-knowledge/agents.md) - Historical, News, and Prediction agents
- [Scheduling](./domain-knowledge/scheduling.md) - Daily job scheduling system

### API Reference

- [OpenAPI Specification](./api/api.yaml) - Full REST API documentation (OpenAPI 3.0)

