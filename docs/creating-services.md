# Creating Services

This guide explains how to create new microservices and actions in the Moleculer TypeScript project.

## Creating a New Microservice

Use the initialization script to scaffold a new microservice with all required files:

```bash
npm run init:microservice -- <domain> <microservice> [services]
```

### Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `domain` | Domain name for grouping related services | `order`, `user`, `payment` |
| `microservice` | Microservice name | `order`, `user` |
| `services` | Comma-separated list of services (optional) | `profile,settings` |

### Examples

```bash
# Create an order microservice with a single "order" service
npm run init:microservice -- order order

# Create a user microservice with multiple services
npm run init:microservice -- user user profile,settings

# Create a payment microservice with transaction and refund services
npm run init:microservice -- payment payment transaction,refund
```

### What Gets Created

The script creates the following structure:

```
apps/domain.{domain}/microservice.{microservice}/
├── app.ts                # Entry point
├── moleculer.config.ts   # Moleculer configuration
├── package.json          # Workspace package
├── tsconfig.json         # TypeScript configuration
├── .env                  # Environment variables
└── services/
    └── {serviceName}/
        ├── create.action.ts   # Example create action
        └── list.action.ts     # Example list action
```

### After Initialization

```bash
# 1. Install dependencies
npm install

# 2. Generate types for type-safe calls
npm run generate:types:all

# 3. Start development server
npm run dev -w microservice.{name}

# 4. Customize your actions in services/ folder
```

## Generated Files Reference

The init script creates these files with sensible defaults:

### app.ts

```typescript
import "dotenv/config";
import { createApp, run } from "core.lib/broker";
import createConfig from "./moleculer.config";

const config = createConfig();
const app = createApp(config);
run(app.broker);
```

### moleculer.config.ts

```typescript
import { createServiceConfig } from "core.lib/config";
import * as path from "path";

export default () =>
  createServiceConfig("{microservice}", {
    servicesPath: path.join(__dirname, "services"),
  });
```

### .env

```env
NODE_ENV=development
```

## Creating Actions

Actions follow the pattern: `services/{serviceName}/{actionName}.action.ts`

### Basic Action

```typescript
// services/user/create.action.ts
import { defineAction } from "core.lib/broker";
import { TypedContext } from "../../__generated__/context";

export interface CreateUserParams {
  email: string;
  name: string;
  password: string;
}

export interface CreateUserResult {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export default defineAction<CreateUserParams, CreateUserResult>({
  // Moleculer validation schema
  params: {
    email: { type: "email" },
    name: { type: "string", min: 2, max: 100 },
    password: { type: "string", min: 8 },
  },

  async handler(ctx: TypedContext<CreateUserParams>) {
    const { email, name, password } = ctx.params;

    // Your implementation here
    const user = {
      id: "user-123",
      email,
      name,
      createdAt: new Date(),
    };

    return user;
  },
});
```

### Action with Optional Params

```typescript
// services/user/list.action.ts
import { defineAction } from "core.lib/broker";
import { TypedContext } from "../../__generated__/context";

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface ListUsersResult {
  users: Array<{ id: string; email: string; name: string }>;
  total: number;
  page: number;
  limit: number;
}

export default defineAction<ListUsersParams, ListUsersResult>({
  params: {
    page: { type: "number", optional: true, default: 1, min: 1 },
    limit: { type: "number", optional: true, default: 10, min: 1, max: 100 },
    search: { type: "string", optional: true },
  },

  async handler(ctx: TypedContext<ListUsersParams>) {
    const { page = 1, limit = 10, search } = ctx.params;

    // Your implementation
    return {
      users: [],
      total: 0,
      page,
      limit,
    };
  },
});
```

### Action Calling Other Actions

```typescript
// services/order/create.action.ts
import { defineAction } from "core.lib/broker";
import { TypedContext } from "../../__generated__/context";

export interface CreateOrderParams {
  userId: string;
  items: Array<{ productId: string; quantity: number }>;
}

export interface CreateOrderResult {
  orderId: string;
  total: number;
}

export default defineAction<CreateOrderParams, CreateOrderResult>({
  params: {
    userId: { type: "string" },
    items: { type: "array", items: { type: "object" } },
  },

  async handler(ctx: TypedContext<CreateOrderParams>) {
    const { userId, items } = ctx.params;

    // Call another service action with full type safety
    const user = await ctx.call("user.get", { id: userId });
    
    // TypeScript knows the return type!
    console.log(user.email);

    return {
      orderId: "order-123",
      total: 99.99,
    };
  },
});
```

## Generate Types

After creating actions or events, generate types for type-safe calls:

```bash
# Generate for all microservices
npm run generate:types:all

# Generate for a specific microservice
npm run generate:types -- --microservice microservice.myapp
```

## Creating Events

Events follow the pattern: `services/{serviceName}/{eventName}.event.ts`

Events are used for async, fire-and-forget communication between services. Unlike actions, events don't return a value.

### Basic Event Handler

```typescript
// services/user/created.event.ts
import { defineEvent } from "core.lib/broker";
import type { TypedContext } from "core.lib/__generated__";

export interface UserCreatedPayload {
  userId: string;
  email: string;
  createdAt: Date;
}

export default defineEvent<UserCreatedPayload>({
  async handler(ctx: TypedContext<UserCreatedPayload>) {
    const { userId, email, createdAt } = ctx.params;
    
    // Send welcome email
    await sendWelcomeEmail(email);
    
    // Update analytics
    await ctx.call("analytics.track", { 
      event: "user_created", 
      userId 
    });
  },
});
```

### Event with Load Balancing

Use `group` to ensure only one service instance handles the event:

```typescript
// services/notification/sendEmail.event.ts
import { defineEvent } from "core.lib/broker";

export interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
}

export default defineEvent<SendEmailPayload>({
  // Only one instance per group receives the event
  group: "email-workers",
  
  async handler(ctx) {
    const { to, subject, body } = ctx.params;
    await emailService.send({ to, subject, body });
  },
});
```

### Emitting Events

From an action, you can emit events:

```typescript
// services/user/create.action.ts
export default defineAction<CreateUserParams, CreateUserResult>({
  async handler(ctx: TypedContext<CreateUserParams>) {
    const user = await createUser(ctx.params);
    
    // Emit event (balanced - one random handler receives it)
    await ctx.emit("user.created", {
      userId: user.id,
      email: user.email,
      createdAt: user.createdAt,
    });
    
    // Broadcast event (all handlers receive it)
    await ctx.broadcast("user.created", {
      userId: user.id,
      email: user.email,
      createdAt: user.createdAt,
    });
    
    return user;
  },
});
```

## File Naming Rules

| Pattern | Example | Result |
|---------|---------|--------|
| `{name}.action.ts` | `login.action.ts` | Action named `login` |
| `{name}.event.ts` | `created.event.ts` | Event handler for `created` |
| Folder name | `services/auth/` | Service named `auth` |
| Action combined | `services/auth/login.action.ts` | `auth.login` |
| Event combined | `services/user/created.event.ts` | `user.created` |

## Validation Types

Moleculer's built-in validator supports these types:

| Type | Description |
|------|-------------|
| `string` | String value |
| `number` | Number value |
| `boolean` | Boolean value |
| `email` | Email address |
| `url` | URL |
| `uuid` | UUID |
| `date` | Date (string or Date object) |
| `array` | Array with optional `items` |
| `object` | Object with optional `props` |
| `enum` | One of specified values |
| `any` | Any value |

### Validation Options

```typescript
params: {
  // Required string, 2-100 chars
  name: { type: "string", min: 2, max: 100 },
  
  // Optional with default
  page: { type: "number", optional: true, default: 1 },
  
  // Enum values
  status: { type: "enum", values: ["active", "inactive"] },
  
  // Nested object
  address: {
    type: "object",
    props: {
      street: { type: "string" },
      city: { type: "string" },
    },
  },
  
  // Array of objects
  items: {
    type: "array",
    items: {
      type: "object",
      props: {
        id: { type: "string" },
        qty: { type: "number", min: 1 },
      },
    },
  },
}
```
