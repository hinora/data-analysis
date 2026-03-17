# Testing Guide

This project uses **Jest** with **ts-jest** for testing. Tests run against a real PostgreSQL database using temporary databases that are created and destroyed per test suite.

## Prerequisites

- **Node.js** >= 18
- **PostgreSQL 16+** — a dedicated test instance

## Test Database Setup

The test database must run on a **separate port** from the development database to avoid conflicts.

### Start the test database

```bash
# Start only the test database container (port 5433)
docker compose up -d postgres-test

# Or start all services (dev DB + test DB + Jaeger)
docker compose up -d
```

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | Development database (pgvector) |
| `postgres-test` | 5433 | Test database |

### Configure the connection

Set `TEST_PG_URI` in your `.env` (or export it):

```bash
TEST_PG_URI=postgresql://postgres:postgres@localhost:5433/postgres
```

The test utilities in `lib/testing/database.ts` read this variable. When not set, they fall back to `postgresql://postgres:postgres@localhost:5432/postgres` — but this conflicts with the local development database, so always set it.

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode (re-run on file changes)
npm run test:watch

# Run a single test file
npx jest path/to/file.test.ts

# Run tests matching a pattern
npx jest --testPathPattern="session"
```

## Project Structure

```
lib/testing/              # Shared test utilities
  index.ts                # Re-exports all helpers
  context.ts              # createTestContext() — mock Moleculer context
  database.ts             # createTestDataSource() — temp database lifecycle
  ai.ts                   # createMockAIAdapter() — mock AI adapter
  define-test.ts          # defineTest() — declarative test helper
  stubs/
    generated-types.ts    # Stub for core.lib/__generated__ (avoids codegen in tests)

apps/**/services/**/__tests__/   # Action/event tests (co-located)
lib/**/__tests__/                # Library unit tests
```

## Writing a New Test

### 1. Create the test file

Place tests in a `__tests__` directory next to the source file:

```
services/
  session/
    create.action.ts          # Source
    __tests__/
      create.action.test.ts   # Test
```

### 2. Boilerplate: action test with database

```typescript
import type { DataSource } from "typeorm";
import {
  clearTestDatabase,
  createTestDataSource,
  destroyTestDataSource,
} from "core.lib/testing";
// Import entities used by the action
import { Session } from "../../db/session.entity";
import { Conversation } from "../../db/conversation.entity";

const entities = [Session, Conversation];

// ── Mock the db module so the action uses the test database ──
let testDs: DataSource;
jest.mock("../../../db", () => ({
  get dataSource() {
    return testDs;
  },
}));

// Import the action AFTER the mock is registered
import createAction from "../create.action";

// ── Lifecycle ──
beforeAll(async () => {
  testDs = await createTestDataSource(entities);
});

afterAll(async () => {
  await destroyTestDataSource(testDs);
});

beforeEach(async () => {
  await clearTestDatabase(testDs, entities);
});
```

> **Important**: The `jest.mock("../../../db", ...)` path is relative to the `__tests__` directory. Adjust the depth (`../../..`) to reach the microservice's `db/index.ts`.

### 3. Write tests with `defineTest()`

The `defineTest()` helper provides a declarative way to test action handlers:

```typescript
import { defineTest } from "core.lib/testing";

describe("session.create", () => {
  defineTest({
    name: "should create a session with a custom name",
    action: createAction,
    params: { name: "My Session" },
    db: () => testDs,
    assertResult: (result) => {
      expect(result.name).toBe("My Session");
      expect(result.id).toBeDefined();
      expect(result.status).toBe("active");
    },
    after: [
      {
        entity: Session,
        assert: (sessions) => {
          expect(sessions).toHaveLength(1);
          expect(sessions[0].name).toBe("My Session");
        },
      },
    ],
  });
});
```

### 4. `defineTest()` options reference

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Test case name (appears in Jest output) |
| `action` | `{ handler }` | The action module to test |
| `params` | `object` | Action parameters (`ctx.params`) |
| `callStubs` | `Record<string, any>` | Stubs for `ctx.call()` — keyed by action name |
| `meta` | `Record<string, any>` | Context metadata (e.g. for authenticated contexts) |
| `db` | `() => DataSource` | DataSource getter (required when using `before`/`after`) |
| `before` | `EntitySeed[]` or `(ds) => void` | Seed the database before the action runs |
| `after` | `EntityAssertion[]` or `(ds, result) => void` | Assert database state after the action runs |
| `assertResult` | `(result) => void` | Assert the action return value |
| `expectError` | `string \| RegExp` | Expect the action to throw a matching error |
| `beforeTest` | `() => void` | Custom setup hook (e.g. configure mocks) |
| `afterTest` | `() => void` | Custom teardown hook (e.g. reset mocks) |

### 5. Seeding data (`before`)

```typescript
// Declarative form — array of entity + records
defineTest({
  // ...
  before: [
    {
      entity: Session,
      data: [
        { id: "s1", name: "Existing Session", status: "active" },
      ],
    },
  ],
});

// Imperative form — function with full DataSource access
defineTest({
  // ...
  before: async (ds) => {
    const repo = ds.getRepository(Session);
    await repo.save(repo.create({ name: "Custom setup" }));
  },
});
```

### 6. Asserting DB state (`after`)

```typescript
// Declarative form
defineTest({
  // ...
  after: [
    {
      entity: Session,
      assert: (sessions) => {
        expect(sessions).toHaveLength(1);
      },
      order: { createdAt: "ASC" }, // optional ordering
    },
  ],
});

// Imperative form
defineTest({
  // ...
  after: async (ds, result) => {
    const count = await ds.getRepository(Session).count();
    expect(count).toBe(1);
  },
});
```

### 7. Testing error cases

```typescript
defineTest({
  name: "should throw when session not found",
  action: deleteAction,
  params: { sessionId: "non-existent" },
  db: () => testDs,
  expectError: "Session not found",
});
```

### 8. Mocking inter-service calls (`callStubs`)

```typescript
defineTest({
  name: "should call session.updateSessionStatus",
  action: myAction,
  params: { sessionId: "s1" },
  callStubs: {
    "session.updateSessionStatus": { success: true },
    "dataset.listDatasets": async () => [{ id: "d1", name: "Test" }],
  },
  assertResult: (result) => {
    expect(result).toBeDefined();
  },
});
```

### 9. Mocking the AI adapter

For actions that use `createAIAdapter()`, mock the module:

```typescript
import { createMockAIAdapter } from "core.lib/testing";

const mockAI = createMockAIAdapter();
jest.mock("core.lib/adapters/ai", () => ({
  createAIAdapter: () => mockAI,
}));

// Override return values per test
mockAI.generateText.mockResolvedValueOnce({
  content: "Generated name",
  completionTokens: 5,
  promptTokens: 10,
  totalTokens: 15,
  durationMs: 100,
  model: "test-model",
});
```

## Writing a Unit Test (No Database)

For pure functions that don't need a database:

```typescript
import { myUtilFunction } from "../my-util";

describe("myUtilFunction", () => {
  it("should return expected result", () => {
    const result = myUtilFunction({ input: "test" });
    expect(result).toBe("expected");
  });
});
```

## CI

Tests run automatically on every push and pull request via `.github/workflows/ci.yml`. The CI pipeline uses a PostgreSQL 16 service container:

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    ports:
      - 5432:5432
```

The `TEST_PG_URI` is set to `postgresql://postgres:postgres@localhost:5432/postgres` in CI — this is safe because the CI environment has no conflicting development database.

## Troubleshooting

### "Connection refused" errors

Make sure the test database container is running:

```bash
docker compose up -d postgres-test
```

### Tests using the development database

Ensure `TEST_PG_URI` points to port **5433** (the test container), not **5432** (the dev container):

```bash
TEST_PG_URI=postgresql://postgres:postgres@localhost:5433/postgres
```

### Leftover test databases

Test databases are auto-dropped in `afterAll`. If a test crashes, orphan `test_*` databases may remain. Clean them up:

```bash
# Connect to the test PostgreSQL instance
psql -h localhost -p 5433 -U postgres

# List test databases
\l

# Drop orphans
DROP DATABASE IF EXISTS "test_1234567890_abc123";
```
