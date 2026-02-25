# Core Library

The `core.lib` package is the shared library used by all microservices. It provides utilities for creating brokers, defining actions, managing configuration, and generating types.

## Modules

### broker

The broker module provides utilities for creating and running Moleculer service brokers.

```typescript
import { createApp, defineAction, run, Runner } from "core.lib/broker";
```

#### createApp(options)

Creates a Moleculer application that automatically loads services from the `services/` folder.

```typescript
import { createApp } from "core.lib/broker";
import config from "./moleculer.config";

const app = createApp(config);

// Returns:
// {
//   broker: ServiceBroker,
//   start(): Promise<void>,
//   stop(): Promise<void>,
//   call(actionName, params, opts): Promise<any>,
//   emit(eventName, data, opts): void,
//   broadcast(eventName, data, opts): void,
//   serviceCount: number,
//   serviceNames: string[]
// }
```

#### defineAction<P, R>(definition)

Defines a typed action with params and handler:

```typescript
import { defineAction } from "core.lib/broker";
import { TypedContext } from "../../__generated__/context";

export interface LoginParams {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: { id: string; email: string };
}

export default defineAction<LoginParams, LoginResult>({
  // Moleculer validation schema
  params: {
    email: { type: "email" },
    password: { type: "string", min: 8 },
  },
  
  // Action handler
  async handler(ctx: TypedContext<LoginParams>) {
    const { email, password } = ctx.params;
    // Implementation...
    return { token: "...", user: { id: "1", email } };
  },
});
```

#### run(broker)

Starts the broker and keeps it running with graceful shutdown:

```typescript
import { createApp, run } from "core.lib/broker";

const app = createApp(config);
run(app.broker);
```

Features:
- Keeps the process alive (even without transporter)
- Handles SIGINT/SIGTERM for graceful shutdown
- Enables REPL console in development mode

#### Runner class

For more control over the runner:

```typescript
import { createApp, Runner } from "core.lib/broker";

const app = createApp(config);
const runner = new Runner(app.broker, {
  enableRepl: true,
  gracefulTimeout: 5000,
});
await runner.start();
```

### config

The config module provides configuration management with defaults and environment presets.

```typescript
import { 
  defaultConfig, 
  defineConfig, 
  extendConfig,
  createServiceConfig,
  developmentConfig,
  stagingConfig,
  productionConfig 
} from "core.lib/config";
```

#### defaultConfig

Base configuration with sensible defaults:

```typescript
const defaultConfig = {
  namespace: process.env.NAMESPACE || "",
  logLevel: process.env.LOG_LEVEL || "info",
  logger: true,
  skipProcessEventRegistration: true,
  transporter: process.env.TRANSPORTER || null,
  requestTimeout: 10000,
  retryPolicy: { enabled: true, retries: 5, ... },
  circuitBreaker: { enabled: true, ... },
  // ... more options
};
```

#### defineConfig(overrides)

Merges overrides with default config:

```typescript
const config = defineConfig({
  nodeID: "my-service",
  logLevel: "debug",
});
```

#### createServiceConfig(options)

Creates a complete service configuration with namespace from NODE_ENV:

```typescript
export default createServiceConfig({
  nodeID: "auth-service",
  // Automatically sets namespace from NODE_ENV
});
```

#### Environment Presets

```typescript
// Development: verbose logging, no circuit breaker
import { developmentConfig } from "core.lib/config";

// Staging: moderate settings
import { stagingConfig } from "core.lib/config";

// Production: optimized for performance
import { productionConfig } from "core.lib/config";
```

### moleculer

Re-exports from the Moleculer package:

```typescript
import { ServiceBroker, Context, Service } from "core.lib/moleculer";
```

## Package Exports

The library uses package.json exports for subpath imports:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./broker": "./dist/broker/index.js",
    "./config": "./dist/config/index.js",
    "./moleculer": "./dist/moleculer/index.js"
  }
}
```

For TypeScript to recognize these paths in development, use ts-node:

```json
{
  "dependencies": {
    "core.lib": "file:../../../lib"
  }
}
```
