# Project Structure

This document explains the folder structure and architecture of the Moleculer TypeScript Microservices project.

## Overview

```
moleculer-ts/
├── lib/                          # Shared core library
├── apps/                         # Microservices organized by domain
├── docs/                         # Documentation
├── package.json                  # Root package with npm workspaces
├── tsconfig.json                 # Base TypeScript configuration
└── node_modules/                 # Hoisted dependencies
```

## Root Level

### package.json

The root `package.json` configures npm workspaces:

```json
{
  "workspaces": [
    "lib",
    "apps/*/*"
  ]
}
```

This allows:
- `lib` to be imported as `core.lib` in any microservice
- Each microservice in `apps/*/*` to be a separate npm workspace

### Scripts

| Script | Description |
|--------|-------------|
| `init:microservice` | Initialize a new microservice with scaffolding |
| `generate:types` | Generate types for a single microservice |
| `generate:types:all` | Generate types for all microservices |

## lib/ - Core Library

The shared library that all microservices import from. Published as `core.lib` via npm workspaces.

```
lib/
├── index.ts              # Main exports
├── package.json          # Package config with exports
├── tsconfig.json         # TypeScript config
├── broker/               # Broker utilities
│   ├── index.ts          # Exports createApp, defineAction, run, etc.
│   ├── createApp.ts      # Auto-loading service broker
│   ├── runner.ts         # Keeps service alive, handles signals
│   └── types.ts          # Type definitions
├── config/               # Configuration system
│   ├── index.ts          # Exports config utilities
│   ├── default.ts        # Default configuration
│   ├── types.ts          # Config type definitions
│   └── utils.ts          # Utility functions
├── codegen/              # Type generation
│   ├── generate-action-types.ts  # Single microservice generator
│   └── generate-all.ts           # All microservices generator
└── moleculer/            # Moleculer re-exports
    ├── broker.ts         # ServiceBroker export
    ├── context.ts        # Context export
    └── service.ts        # Service type exports
```

### Import Paths

The library supports subpath imports:

```typescript
// Import everything
import { createApp, defineAction } from "core.lib";

// Import specific modules
import { createApp, defineAction, run } from "core.lib/broker";
import { defineConfig, createServiceConfig } from "core.lib/config";
import { ServiceBroker, Context } from "core.lib/moleculer";
```

## apps/ - Microservices

Microservices are organized by domain:

```
apps/
├── domain.auth/
│   └── microservice.auth/
├── domain.book/
│   └── microservice.book/
└── domain.{name}/
    └── microservice.{name}/
```

### Microservice Structure

Each microservice follows this structure:

```
microservice.{name}/
├── app.ts                # Entry point
├── moleculer.config.ts   # Microservice-specific config
├── package.json          # Workspace package config
├── tsconfig.json         # TypeScript config extending root
├── .env                  # Environment variables
├── db/                   # Database models and queries
│   ├── index.ts          # Exports all tables
│   └── {name}.table.ts   # Table schema and query functions
├── services/             # Service definitions
│   └── {serviceName}/    # Service folder
│       ├── {action}.action.ts   # Action file
│       ├── {action}.action.ts   # Action file
│       └── {event}.event.ts     # Event handler file
└── __generated__/        # Auto-generated types (git-ignored)
    ├── registry.ts       # Action & Event registry
    ├── context.ts        # TypedContext export
    ├── actions/          # Individual action types
    │   └── {service}.{action}.ts
    └── events/           # Individual event types
        └── {service}.{event}.ts
```

### Action File Convention

Actions are discovered automatically based on the folder structure:

```
services/
├── auth/
│   ├── login.action.ts      → auth.login
│   └── forgotPassword.action.ts → auth.forgotPassword
└── user/
    ├── create.action.ts     → user.create
    └── list.action.ts       → user.list
```

**Pattern:** `/services/{serviceName}/{actionName}.action.ts`

### Event File Convention

Events are discovered automatically based on the folder structure:

```
services/
├── user/
│   ├── created.event.ts     → user.created
│   └── updated.event.ts     → user.updated
└── order/
    └── placed.event.ts      → order.placed
```

**Pattern:** `/services/{serviceName}/{eventName}.event.ts`

## Type System

### TypedContext

Each microservice generates a `TypedContext` that provides type-safe `ctx.call()`:

```typescript
import { TypedContext } from "../../__generated__/context";

async handler(ctx: TypedContext<MyParams>) {
  // ctx.call() has full autocomplete for:
  // - Action names (e.g., "auth.login", "book.create")
  // - Parameter types for each action
  // - Return types for each action
  const result = await ctx.call("auth.login", { email, password });
}
```

### Generated Files

The `__generated__/` folder contains:

1. **registry.ts** - Maps action names to their param/result types
2. **context.ts** - Exports `TypedContext` with typed `call()` method
3. **actions/{service}.{action}.ts** - Individual action type imports

## File Naming Conventions

| Pattern | Example | Purpose |
|---------|---------|---------|
| `*.action.ts` | `login.action.ts` | Action definition |
| `moleculer.config.ts` | - | Microservice configuration |
| `app.ts` | - | Microservice entry point |
| `__generated__/` | - | Auto-generated type files |
