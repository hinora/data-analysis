# Type Generation

This document explains how the type-safe service call and event system works.

## Overview

The type generation system provides:

- **Autocomplete** for action names in `ctx.call()` and event names in `ctx.emit()`/`ctx.broadcast()`
- **Type checking** for action parameters and event payloads
- **Typed return values** from service calls
- **Cross-microservice type support** - call actions and emit events from other microservices with full type safety

## How It Works

### 1. Action Definition

Each action exports its param and result interfaces:

```typescript
// services/auth/login.action.ts
export interface LoginParams {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: { id: string; email: string };
}

export default defineAction<LoginParams, LoginResult>({ ... });
```

### 1.5. Event Definition

Each event exports its payload interface:

```typescript
// services/user/created.event.ts
export interface UserCreatedPayload {
  userId: string;
  email: string;
  createdAt: Date;
}

export default defineEvent<UserCreatedPayload>({
  async handler(ctx) {
    const { userId, email, createdAt } = ctx.params;
    // Send welcome email, update analytics, etc.
  }
});
```

### 2. Type Generation

The codegen script scans all action files and generates type registries:

```bash
npm run generate:types:all
```

This creates:

1. **Local `__generated__/`** in each microservice (for that microservice's actions only)
2. **Global `lib/__generated__/`** with ALL actions from ALL microservices

```
lib/__generated__/
├── registry.ts       # Global registry with all actions
├── context.ts        # TypedContext with cross-microservice support
└── index.ts          # Re-exports

microservice.auth/__generated__/
├── registry.ts       # Local registry (auth actions only)
├── context.ts        # Local TypedContext
└── actions/
    ├── auth.login.ts
    └── auth.forgotPassword.ts
```

### 3. Type-Safe Calls (Cross-Microservice)

Import `TypedContext` or `AuthenticatedTypedContext` from the **global** `core.lib/__generated__` for cross-microservice type support:

```typescript
// For public endpoints (no authentication)
import type { TypedContext } from "core.lib/__generated__";

async handler(ctx: TypedContext<MyParams>) {
  // Autocomplete suggests ALL actions from ALL microservices:
  // - auth.login, auth.forgotPassword (from microservice.auth)
  // - books.getBooks, books.getBookById (from microservice.book)
  
  const result = await ctx.call("auth.login", {
    email: "user@example.com",
    password: "secret",
  });
  
  // result is typed as LoginResult
  console.log(result.token);
  console.log(result.user.email);
}
```

### 4. Authenticated Actions with Type-Safe Calls

For actions that require authentication (`authentication: true`), use `AuthenticatedTypedContext`:

```typescript
// For protected endpoints (authentication: true)
import type { AuthenticatedTypedContext } from "core.lib/__generated__";

export const bookmarkChapterAction = defineAction<Params, Result>({
  authentication: true,
  rest: "POST /chapter",

  async handler(ctx: AuthenticatedTypedContext<Params>) {
    // Access authenticated user
    const { user } = ctx.meta;
    console.log(user.id, user.email);

    // Type-safe ctx.call with autocomplete for ALL actions
    const book = await ctx.call("books.getBookById", { id: bookId });
    // book is typed as GetBookByIdResult
  },
});
```

**When to use which context:**

| Context Type | Use Case | Features |
|-------------|----------|----------|
| `TypedContext<P>` | Public endpoints | Typed `ctx.call()` with autocomplete |
| `AuthenticatedTypedContext<P>` | Protected endpoints | Typed `ctx.call()` + `ctx.meta.user` |

## Generated Files

### Global Registry (lib/__generated__/registry.ts)

Maps ALL action names from ALL microservices to their types:

```typescript
import type { LoginParams, LoginResult } from "../../apps/.../login.action";
import type { CreateBookParams, CreateBookResult } from "../../apps/.../create.action";
import type { ForgotPasswordParams, ForgotPasswordResult } from "../services/auth/forgotPassword.action";

export interface ActionRegistry {
  "auth.login": {
    params: LoginParams;
    result: LoginResult;
  };
  "auth.forgotPassword": {
    params: ForgotPasswordParams;
    result: ForgotPasswordResult;
  };
}

export type ActionName = keyof ActionRegistry;
```

### context.ts

Extends Moleculer's Context with typed call method:

```typescript
import { Context as MoleculerContext } from "moleculer";
import { ActionRegistry, ActionName } from "./registry";

// For public endpoints
export interface TypedContext<P = unknown> extends MoleculerContext<P> {
  call<K extends ActionName>(
    actionName: K,
    params: ActionRegistry[K]["params"],
    opts?: CallingOptions
  ): Promise<ActionRegistry[K]["result"]>;
}

// For authenticated endpoints
export interface AuthenticatedTypedContext<P = unknown> extends TypedContext<P> {
  meta: TypedContext<P>["meta"] & { user: AuthenticatedUser };
}
```

## Running the Generator

### Generate All Microservices

```bash
npm run generate:types:all
```

Output:
```
🔍 Scanning for microservices...
Found 2 microservice(s):
   - microservice.auth
   - microservice.book
==================================================
Generating action types...
==================================================
📦 microservice.auth - ✅ Generated types successfully
📦 microservice.book - ✅ Generated types successfully
==================================================
✅ Success: 2
==================================================
```

### Generate Single Microservice

```bash
npm run generate:types -- --microservice microservice.auth
```

Or from within a microservice:

```bash
npm run generate:types
```

## Interface Naming Conventions

The generator looks for interfaces with these naming patterns:

| Pattern | Example | File Type |
|---------|---------|-----------|
| `{ActionName}Params` | `LoginParams`, `CreateBookParams` | Action |
| `{ActionName}Result` | `LoginResult`, `CreateBookResult` | Action |
| `{EventName}Payload` | `UserCreatedPayload`, `OrderPlacedPayload` | Event |

These are derived from the file name:
- `login.action.ts` → `LoginParams`, `LoginResult`
- `createBook.action.ts` → `CreateBookParams`, `CreateBookResult`
- `userCreated.event.ts` → `UserCreatedPayload`

## Best Practices

### 1. Always Export Interfaces

```typescript
// ✅ Good - interfaces are exported
export interface LoginParams { ... }
export interface LoginResult { ... }

// ❌ Bad - interfaces are not exported
interface LoginParams { ... }
interface LoginResult { ... }
```

### 2. Use Consistent Naming

```typescript
// ✅ Good - matches file name "login.action.ts"
export interface LoginParams { ... }
export interface LoginResult { ... }

// ❌ Bad - doesn't match file name
export interface AuthLoginParams { ... }
export interface AuthLoginResponse { ... }
```

### 3. Re-generate After Changes

Always run type generation after:
- Creating new actions
- Modifying param/result interfaces
- Renaming or deleting actions

```bash
npm run generate:types:all
```

### 4. Git Ignore Generated Files

The `__generated__/` folder should be in `.gitignore`:

```gitignore
# Generated types
__generated__/
```

Generate types as part of your build process:

```json
{
  "scripts": {
    "prebuild": "npm run generate:types:all",
    "build": "tsc"
  }
}
```

## Troubleshooting

### Types Not Updating

1. Delete the `__generated__/` folder
2. Run `npm run generate:types:all`
3. Restart your TypeScript language server (VS Code: `Cmd+Shift+P` → "Restart TS Server")

### Missing Autocomplete

Ensure you're using `TypedContext` or `AuthenticatedTypedContext`:

```typescript
// ✅ Correct - Public endpoint
import type { TypedContext } from "core.lib/__generated__";
async handler(ctx: TypedContext<MyParams>) { ... }

// ✅ Correct - Protected endpoint (authentication: true)
import type { AuthenticatedTypedContext } from "core.lib/__generated__";
async handler(ctx: AuthenticatedTypedContext<MyParams>) { ... }

// ❌ Wrong - regular Context has no action types
import { Context } from "core.lib/broker";
async handler(ctx: Context<MyParams>) { ... }

// ❌ Wrong - AuthenticatedContext has no typed call
import type { AuthenticatedContext } from "core.lib/broker";
async handler(ctx: AuthenticatedContext<MyParams>) { ... }
```

### Interface Not Found

Check that your interfaces match the expected naming:

```typescript
// File: create.action.ts
// Expected interfaces: CreateParams, CreateResult

// If your action file is "createBook.action.ts"
// Expected interfaces: CreateBookParams, CreateBookResult
```
