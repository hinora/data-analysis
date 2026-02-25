# Configuration

This document explains the configuration system and environment variables for the Moleculer TypeScript project.

## Configuration Hierarchy

Configuration is merged in the following order (later overrides earlier):

1. **defaultConfig** - Base defaults in `lib/config/default.ts`
2. **Environment Presets** - `developmentConfig`, `stagingConfig`, `productionConfig`
3. **Service Config** - `moleculer.config.ts` in each microservice
4. **Environment Variables** - `.env` file and system environment

## Default Configuration

The base configuration includes sensible defaults:

```typescript
const defaultConfig = {
  // General
  namespace: process.env.NAMESPACE || "",
  logLevel: process.env.LOG_LEVEL || "info",
  logger: true,
  
  // Process handling (runner manages this)
  skipProcessEventRegistration: true,
  
  // Networking
  transporter: process.env.TRANSPORTER || null,
  requestTimeout: 10000,
  
  // Retry Policy
  retryPolicy: {
    enabled: true,
    retries: 5,
    delay: 100,
    maxDelay: 1000,
    factor: 2,
  },
  
  // Circuit Breaker
  circuitBreaker: {
    enabled: true,
    threshold: 0.5,
    windowTime: 60,
    minRequestCount: 20,
    halfOpenTime: 10000,
  },
  
  // Bulkhead (disabled by default)
  bulkhead: {
    enabled: false,
    concurrency: 10,
    maxQueueSize: 100,
  },
  
  // Request Tracking
  tracking: {
    enabled: true,
    shutdownTimeout: 5000,
  },
  
  // Registry
  registry: {
    strategy: "RoundRobin",
    preferLocal: true,
  },
  
  // Heartbeat
  heartbeatInterval: 5,
  heartbeatTimeout: 15,
  
  // Limits
  maxCallLevel: 100,
  contextParamsCloning: false,
  
  // Validation & Observability
  validator: true,
  metrics: { enabled: false },
  tracing: { enabled: false },
};
```

## Environment Variables

### Core Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | string | - | Environment (development/staging/production) |
| `NAMESPACE` | string | `""` | Moleculer namespace for node segmentation |
| `LOG_LEVEL` | string | `"info"` | Log level (trace/debug/info/warn/error/fatal) |

### Networking

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TRANSPORTER` | string | `null` | Transporter URL |
| `REQUEST_TIMEOUT` | number | `10000` | Request timeout in milliseconds |

### Transporter Examples

```env
# NATS
TRANSPORTER=nats://localhost:4222

# Redis
TRANSPORTER=redis://localhost:6379

# MQTT
TRANSPORTER=mqtt://localhost:1883

# TCP (no external broker needed)
TRANSPORTER=TCP
```

### Observability

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `METRICS_ENABLED` | boolean | `false` | Enable metrics collection |
| `TRACING_ENABLED` | boolean | `false` | Enable distributed tracing |

## Environment Presets

### Development

Optimized for local development:

```typescript
const developmentConfig = {
  logLevel: "info",
  circuitBreaker: { enabled: false },
  retryPolicy: { enabled: false },
};
```

### Staging

Balanced settings for testing:

```typescript
const stagingConfig = {
  logLevel: "info",
  metrics: { enabled: true },
  tracing: { enabled: true },
};
```

### Production

Optimized for performance and reliability:

```typescript
const productionConfig = {
  logLevel: "warn",
  metrics: { enabled: true },
  tracing: { enabled: true },
  circuitBreaker: {
    enabled: true,
    threshold: 0.3,
    minRequestCount: 30,
  },
};
```

## Creating Service Config

### Basic Configuration

```typescript
// moleculer.config.ts
import { createServiceConfig } from "core.lib/config";

export default createServiceConfig({
  nodeID: "my-service",
});
```

### With Environment Preset

```typescript
// moleculer.config.ts
import { createServiceConfig, developmentConfig } from "core.lib/config";

export default createServiceConfig({
  ...developmentConfig,
  nodeID: "my-service",
});
```

### With Custom Overrides

```typescript
// moleculer.config.ts
import { createServiceConfig } from "core.lib/config";

export default createServiceConfig({
  nodeID: "my-service",
  
  // Custom settings
  logLevel: "debug",
  requestTimeout: 30000,
  
  // Custom middleware
  middlewares: [
    {
      name: "CustomMiddleware",
      localAction(next, action) {
        return async function(ctx) {
          console.log(`Calling ${action.name}`);
          return next(ctx);
        };
      },
    },
  ],
});
```

## Using Environment Files

### .env File

Create a `.env` file in each microservice:

```env
NODE_ENV=development
NAMESPACE=dev
LOG_LEVEL=debug
TRANSPORTER=nats://localhost:4222
METRICS_ENABLED=true
```

### Loading Order

The dotenv package must be imported **before** any config that reads environment variables:

```typescript
// app.ts
import "dotenv/config";  // MUST be first!
import { createApp, run } from "core.lib/broker";
import config from "./moleculer.config";
```

## Configuration Functions

### defineConfig(overrides)

Merges overrides with default config:

```typescript
import { defineConfig } from "core.lib/config";

const config = defineConfig({
  nodeID: "my-service",
  logLevel: "debug",
});
```

### extendConfig(base, overrides)

Extends a base config with overrides:

```typescript
import { extendConfig, developmentConfig } from "core.lib/config";

const config = extendConfig(developmentConfig, {
  nodeID: "my-service",
});
```

### createServiceConfig(options)

Creates a complete service config with namespace from NODE_ENV:

```typescript
import { createServiceConfig } from "core.lib/config";

export default createServiceConfig({
  nodeID: "my-service",
  // namespace is automatically set from NODE_ENV
});
```

## Multi-Environment Setup

### Directory Structure

```
microservice.myapp/
├── .env                  # Local development
├── .env.staging          # Staging environment
├── .env.production       # Production environment
└── moleculer.config.ts
```

### Loading Environment-Specific Config

```typescript
// app.ts
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment-specific .env file
const envFile = process.env.NODE_ENV 
  ? `.env.${process.env.NODE_ENV}` 
  : ".env";
  
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

import { createApp, run } from "core.lib/broker";
import config from "./moleculer.config";

const app = createApp(config);
run(app.broker);
```
