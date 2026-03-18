# Data Analysis Platform — Copilot Instructions

## Project Overview

This is a microservice-based **agentic data analysis** platform built with **Moleculer** and **TypeScript**. It has a Next.js frontend. Users upload datasets (CSV, PDF, XLSM) and interact with their data through an AI-powered chat interface that orchestrates 16+ analysis tools.

## Required Reading

Before making changes, read the relevant documentation:

- README: `README.md`
- Project structure: `docs/project-structure.md`
- Type generation: `docs/type-generation.md`
- Testing guide: `docs/testing.md`
- Validation reference: `lib/broker/validation.ts`
- API documentation: `docs/api/api.yaml`
- Domain knowledge: `docs/domain-knowledge/**`

## Project Structure

```
lib/                          # Shared core library (core.lib)
apps/                         # Microservices organized by domain
  domain.analysis/
    microservice.analysis/    # Sessions, conversations, AI chat
  domain.data/
    microservice.data/        # Upload, datasets, metadata, 16+ tools
  domain.example/
    microservice.example/     # Reference microservice
  domain.platform/
    microservice.proxy/       # API gateway (moleculer-web)
frontend/                     # Next.js frontend
docs/                         # Documentation (source of truth)
  api/api.yaml                # OpenAPI 3.0 spec
  domain-knowledge/           # Feature-specific docs with diagrams
specs/                        # Feature specifications and plans
```

### Microservice Structure

Each microservice follows this structure:

```
microservice.{name}/
├── app.ts                  # Entry point
├── moleculer.config.ts     # Microservice-specific config
├── db/                     # TypeORM entities & data access
│   ├── index.ts            # Exports dataSource and all entities
│   └── {name}.entity.ts    # Entity definition
├── services/               # Service definitions
│   └── {serviceName}/      # Service folder (camelCase)
│       ├── {action}.action.ts   # Action file → serviceName.action
│       ├── {event}.event.ts     # Event handler → serviceName.event
│       └── __tests__/           # Co-located tests
│           └── {action}.action.test.ts
└── __generated__/          # Auto-generated types (git-ignored)
```

## Workflow Checklist

After implementing changes you **must** do these steps:

1. **Backend only:** Add or update tests for every changed action/event — see `docs/testing.md` for how to write tests.
2. Run tests: `npm test` (or `npx jest path/to/file.test.ts` for a single file).
3. Run `npm run lint:fix` in root (biome). If found issues, fix them and re-run.
4. **Backend only:** Run type generation script: `npm run generate:types:all`.
5. **Backend only:** If REST endpoint added → update `docs/api/api.yaml` (OpenAPI).
6. **Backend only:** Add document for features we implemented in `docs/domain-knowledge/*.md` after implementation. Use mermaid diagrams if helpful. If the docs already exist, update them.

## Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install all workspace dependencies |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage |
| `npx jest path/to/file.test.ts` | Run a single test file |
| `npm run lint` | Check code with Biome |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format code with Biome |
| `npm run generate:types:all` | Generate types for all microservices |
| `npm run generate:types` | Generate types for a single microservice |
| `npm run build:lib` | Build the shared core library |

## Testing

- Tests run against a real PostgreSQL database using temporary databases created and destroyed per test suite.
- Test database runs on port **5433** via docker-compose service `postgres-test` (postgres:16).
- Set `TEST_PG_URI=postgresql://postgres:postgres@localhost:5433/postgres`.
- Start test DB: `docker compose up -d postgres-test`.
- Tests are co-located in `__tests__/` directories next to the source files.
- Use `defineTest()` helper from `core.lib/testing` for declarative action testing.
- Mock the db module so actions use the test database: `jest.mock("../../../db", () => ({ get dataSource() { return testDs; } }))`.
- Import the action **after** the mock is registered.

---

## Code Rules (Shared TypeScript)

### Functions: Single Object Parameter

```typescript
// ✅ DO
async function createUser(req: { email: string; name: string }): Promise<User>

// ❌ DON'T
async function createUser(email: string, name: string): Promise<User>
```

**Exceptions**: Simple utils (`max(a,b)`), callbacks, math operations.

### Imports: Named Only

```typescript
// ✅ DO
import { UserService, createUser } from './module';

// ❌ DON'T
import UserService from './module';
import * as utils from './utils';
```

### Exports: Named Only (No Default)

```typescript
// ✅ DO
export class UserService { }
export { createUser } from './user';

// ❌ DON'T
export default class UserService { }
export * from './user';
```

### Ordering: Alphabetical

Sort alphabetically: object properties, interface members, enum values, class methods.

```typescript
// ✅ DO
const user = { age: 30, email: 'a@b.com', name: 'John' };
enum Role { ADMIN = 'admin', GUEST = 'guest', USER = 'user' }
```

**Exception**: Preserve `Promise.all()` destructure order.

### Objects: Inline When Simple

```typescript
// ✅ Simple (≤4 props) → inline
const point = { x: 10, y: 20 };

// ✅ Complex (5+ props or nested) → multi-line
const config = {
  api: { baseUrl: '...', timeout: 5000 },
  database: { host: 'localhost', port: 5432 },
};
```

### JSDoc: No Type Annotations

TypeScript provides types. Never use `{Type}` in JSDoc.

```typescript
// ✅ DO
/**
 * Creates a user.
 * @param req - User creation request
 * @returns Created user
 */
async function createUser(req: CreateUserRequest): Promise<User>

// ❌ DON'T - causes TS80004
/** @param {CreateUserRequest} req */
```

### Async: Parallel When Possible

```typescript
// ✅ Independent operations → Promise.all()
const [user, profile] = await Promise.all([getUser(id), getProfile(id)]);

// ✅ Dependent operations → sequential
const user = await createUser(req);
const profile = await createProfile({ userId: user.id });
```

### Errors: Custom Classes with Context

```typescript
// ✅ DO
throw new NotFoundError('User not found', 'User', userId);

// ❌ DON'T
throw new Error('Not found');
```

### Types: Strict (No `any`)

```typescript
// ✅ DO
function process(data: unknown): User {
  if (!isUser(data)) throw new ValidationError(...);
  return data;
}

// ❌ DON'T
function process(data: any): User { return data as User; }
```

### Constants: UPPER_SNAKE_CASE

```typescript
const MAX_RETRY_ATTEMPTS = 3;
const CACHE_TTL_SECONDS = 3600;
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase + verb | `createUser`, `validateEmail` |
| Classes | PascalCase + noun | `UserService`, `HttpClient` |
| Interfaces | PascalCase (no I prefix) | `User`, `ApiResponse` |
| Booleans | is/has/can/should prefix | `isValid`, `hasPermission` |
| Arrays | plural nouns | `users`, `accounts` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Enums | PascalCase name, UPPER values | `UserRole.ADMIN` |

---

## Backend Rules (Moleculer Microservices)

### Unique Service Names (Critical)

**Moleculer requires every service name to be unique across the entire system.** The service name is derived from the folder name under `services/`. If two microservices both have a `services/session/` folder, they will both register a service called `session` — causing conflicts.

- Before creating a new service folder, **check all microservices** to ensure no other microservice already uses that name.
- If a service name must exist in multiple microservices, use **camelCase** suffix with the domain context (e.g., `sessionData` instead of `session`).
- **Use camelCase for service folder names** (e.g., `sessionData`, `datasetEvent`). Do NOT use kebab-case (`session-data`).
- The event naming convention is `{serviceName}.{eventFileName}` (e.g., `sessionData.sessionDeleted` from `services/sessionData/sessionDeleted.event.ts`).

### Microservice Actions: Use `defineAction`

- This is a microservice-based platform built with Moleculer. Always follow microservice architecture patterns.
- If the action is too complex, split logic into service methods called from the action handler, or split into multiple actions.

### Microservice Events: Use `defineEvent`

- Use events for async, fire-and-forget communication between services.
- Events don't return values — they are used for notifications and side effects.
- Use `ctx.emit()` for load-balanced events (one handler receives) and `ctx.broadcast()` for all handlers.

```typescript
// Event handler - services/user/created.event.ts
import { defineEvent } from "core.lib/broker";
import type { TypedContext } from "core.lib/__generated__";

export interface UserCreatedPayload {
  email: string;
  userId: string;
}

export default defineEvent<UserCreatedPayload>({
  async handler(ctx: TypedContext<UserCreatedPayload>) {
    const { userId, email } = ctx.params;
    await sendWelcomeEmail(email);
  }
});

// Emitting events from an action
await ctx.emit("user.created", { userId, email });
await ctx.broadcast("user.created", { userId, email });
```

### Action Types: External vs Internal

| Type | REST Config | HTTP Access | Service-to-Service | Use Case |
|------|-------------|-------------|-------------------|----------|
| **External** | `rest: "GET /..."` | ✅ Yes | ✅ Yes | Public APIs, user-facing endpoints |
| **Internal** | No `rest` property | ❌ No | ✅ Yes | Inter-service communication, background tasks |

```typescript
// EXTERNAL action - accessible via HTTP AND other services
export const getUserAction = defineAction<GetUserParams, GetUserResult>({
  rest: "GET /:id",
  async handler(ctx) { /* ... */ },
});

// INTERNAL action - only callable by other services (no HTTP access)
export const validateUserInternalAction = defineAction<ValidateParams, ValidateResult>({
  // No `rest` property = internal only
  async handler(ctx) { /* ... */ },
});
```

### REST API: URL Conventions

1. **Define service-level `rest` setting** in the service schema (`index.ts`):
```typescript
const service: ServiceSchema = {
  name: "user",
  settings: {
    rest: "/users",
  },
};
```

2. **Action `rest` is relative to service base path**:
```typescript
// Service: rest: "/users"
// Action: rest: "GET /:id" → Final URL: GET /users/:id
```

3. **Follow RESTful conventions**:

| Operation | HTTP Method | URL Pattern | Example |
|-----------|-------------|-------------|---------|
| List | GET | `/` | `GET /users` |
| Get one | GET | `/:id` | `GET /users/:id` |
| Create | POST | `/` | `POST /users` |
| Update | PUT/PATCH | `/:id` | `PUT /users/:id` |
| Delete | DELETE | `/:id` | `DELETE /users/:id` |
| Sub-resource | GET | `/:id/resource` | `GET /users/:id/avatar` |
| Action | POST | `/:id/action` | `POST /users/:id/activate` |

### Authentication: Protected Endpoints

Use `authentication: true` in `defineAction` to require JWT authentication. The framework automatically:
1. Extracts token from `ctx.meta.token`
2. Validates via `auth.verifyToken` action
3. Assigns authenticated user to `ctx.meta.user`

```typescript
// Protected endpoint
import type { AuthenticatedTypedContext } from "core.lib/__generated__";

export const getProfileAction = defineAction<GetProfileParams, GetProfileResult>({
  authentication: true,
  rest: "GET /profile",
  async handler(ctx: AuthenticatedTypedContext<GetProfileParams>) {
    const user = ctx.meta.user;
    return { email: user.email, id: user.id, nickName: user.nickName };
  },
});

// Public endpoint
import type { TypedContext } from "core.lib/__generated__";

export const loginAction = defineAction<LoginParams, LoginResult>({
  rest: "POST /login",
  async handler(ctx: TypedContext<LoginParams>) {
    const result = await ctx.call("auth.verifyToken", { token });
  },
});
```

**Context Types for Actions:**

| Action Type | Context Type | Features |
|-------------|--------------|----------|
| Public (`authentication: false/undefined`) | `TypedContext<P>` | Typed `ctx.call()` with autocomplete |
| Protected (`authentication: true`) | `AuthenticatedTypedContext<P>` | Typed `ctx.call()` + typed `ctx.meta.user` |

---

## Frontend Rules (Next.js)

### Project Structure

```
frontend/src/
├── components/     # Reusable UI components
├── hooks/          # React Query hooks for data fetching/mutations
├── pages/          # Next.js pages
├── styles/         # Global styles
└── utils/          # Utility functions (auth, query, request)
```

### Data Fetching with React Query

#### Query Hooks (GET requests)

Location: `frontend/src/hooks/use{Resource}.ts`

```typescript
import { service } from "@/utils/request";
import { type QueryFunction, useQuery } from "@tanstack/react-query";

interface IResponse {
  id: string;
}

interface IRequest {
  param1?: string;
}

export const QUERY_KEY = "resourceName";

export const useGetResource = ({ param1 }: IRequest) => {
  return useQuery({
    queryKey: [QUERY_KEY, param1],
    queryFn: queryFunction,
    enabled: !!param1,
  });
};

const queryFunction: QueryFunction<IResponse, [string, string?]> = async ({
  queryKey,
}) => {
  const [_key, param1] = queryKey;
  const response = await service.get<IResponse>("/endpoint", {
    params: { param1 },
  });
  return response.data;
};
```

#### Mutation Hooks (POST/PUT/DELETE requests)

Location: `frontend/src/hooks/use{Action}{Resource}.ts`

```typescript
import { QUERY_KEY } from "./useGetResource";
import { queryClient } from "@/utils/query";
import { service } from "@/utils/request";
import { useMutation } from "@tanstack/react-query";

interface IResponse {
  id: string;
}

interface IRequest {
  bodyData: object;
  param1?: string;
}

export const useCreateResource = () => {
  return useMutation({
    mutationFn: async ({ param1, bodyData }: IRequest): Promise<IResponse> => {
      const response = await service.post<IResponse>("/endpoint", bodyData, {
        params: { param1 },
      });
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEY, variables.param1],
      });
    },
  });
};
```

> **Important:** Always invalidate relevant query caches after mutations.

#### Mutation Hook Usage Rules

1. **Always destructure mutation hooks** — Never use directly:
   ```typescript
   // ❌ Wrong
   const bookmarkMutation = useBookmarkBook();
   bookmarkMutation.mutate(data);

   // ✅ Correct
   const { mutate: bookmarkBook, isPending: isBookmarking } = useBookmarkBook();
   bookmarkBook(data);
   ```

2. **Never use async/await with mutations** — Use callbacks instead:
   ```typescript
   // ❌ Wrong
   onSuccess: async (_data, variables) => {
     await queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
   }

   // ✅ Correct
   onSuccess: (_data, variables) => {
     queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
   }
   ```

### Component Guidelines

| Type | Location | Naming |
|------|----------|--------|
| Components | `frontend/src/components/` | `ComponentName.tsx` (PascalCase) |
| Hooks | `frontend/src/hooks/` | `useHookName.ts` (camelCase) |
| Pages | `frontend/src/pages/` | `page-name.tsx` (kebab-case) |

### Component Structure

```typescript
interface ComponentNameProps {
  id: string;
}

const ComponentName: React.FC<ComponentNameProps> = ({ id }) => {
  const { data, isLoading, error } = useGetResource({ id });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;

  return (
    <div>
      {/* Component content */}
    </div>
  );
};

export default ComponentName;
```

- Components should fetch their own data from the API. Pass only IDs as props, then fetch data inside the component using React Query hooks. React Query handles caching, so duplicate data fetching is not a concern.

### Best Practices

1. **Functional components only** — No class components
2. **TypeScript required** — Define interfaces for all props
3. **Data fetching in components** — Pass IDs as props, fetch data inside using React Query hooks
4. **Scoped styling** — Use CSS modules or styled-components
5. **Composition** — Break large components into smaller, reusable sub-components
6. **Consistent naming** — PascalCase for components, camelCase for files and hooks

---

## Tech Stack

- **Runtime:** Node.js 20 LTS + TypeScript 5.x (strict mode)
- **Microservices:** Moleculer 0.14.x with auto-generated type-safe service calls
- **Frontend:** Next.js / React / React Query
- **Database:** PostgreSQL 16+ with pgvector for vector similarity search
- **ORM:** TypeORM 0.3.x with automatic migrations
- **AI:** Ollama (local) / Google Gemini adapters
- **File Parsing:** CSV (PapaParse), PDF (pdf-parse), XLSM/XLSX (SheetJS)
- **Embeddings:** nomic-embed-text (768-dim vectors via Ollama) or text-embedding-004 (Gemini)
- **Linting:** Biome
