# Database Integration

This document explains how to set up and use PostgreSQL with TypeORM in your microservices.

## Overview

Each microservice connects to its own dedicated PostgreSQL database. The `core.lib/database` module provides helpers to create and manage TypeORM `DataSource` instances. The pgvector extension is used for vector similarity search (embeddings).

## Setup

### 1. Prerequisites

- **PostgreSQL 16+** with pgvector extension
- Recommended Docker image: `pgvector/pgvector:pg16`

```bash
# Start PostgreSQL with pgvector via Docker
docker run -d \
  --name pgvector \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### 2. Environment Variables

Copy `.env.example` to `.env` in the project root and configure:

```bash
# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=analysis_db
```

### 3. Connect in app.ts

The database connection is initialized in each microservice's `app.ts`:

```typescript
import { createDataSource } from "core.lib/database";
import { run } from "core.lib/broker";
import app from "./moleculer.config";

// Create TypeORM DataSource for your microservice
const dataSource = createDataSource({
  database: process.env.POSTGRES_DB || "analysis_db",
  entities: [/* import your entities here */],
});

// Initialize database then start the broker
dataSource
  .initialize()
  .then(() => run(app.broker))
  .catch((err: Error) => console.error(`Error occurred! ${err.message}`));
```

## Database Folder Structure

Each microservice should have a `db` folder with table files:

```
microservice.name/
├── db/
│   ├── index.ts              # Export all tables (entities + query objects)
│   ├── user.table.ts         # User entity and queries
│   └── dataRecord.table.ts   # DataRecord entity and queries
├── services/
│   └── ...
└── app.ts
```

## Creating Table Files

Each table file should contain:
1. TypeORM entity class with column decorators
2. A query object exporting CRUD functions

### Example Table File

```typescript
/**
 * User Table - Entity and Query Functions
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { getDataSource } from "core.lib/database";

// ============================================
// Entity
// ============================================

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({ type: "varchar", length: 255 })
  password!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  firstName?: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  lastName?: string;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

// ============================================
// Query Functions
// ============================================

const getRepo = () => getDataSource().getRepository(User);

export const UserTable = {
  async create(data: Pick<User, "email" | "password" | "firstName" | "lastName">) {
    const repo = getRepo();
    const user = repo.create(data);
    return repo.save(user);
  },

  async findById(id: string) {
    return getRepo().findOneBy({ id });
  },

  async findByEmail(email: string) {
    return getRepo().findOneBy({ email: email.toLowerCase() });
  },

  async updateById(id: string, data: Partial<User>) {
    await getRepo().update(id, data);
    return getRepo().findOneBy({ id });
  },

  async deleteById(id: string) {
    const result = await getRepo().delete(id);
    return (result.affected ?? 0) > 0;
  },

  async list(options: { limit?: number; offset?: number } = {}) {
    const { limit = 10, offset = 0 } = options;
    const repo = getRepo();

    const [users, total] = await repo.findAndCount({
      take: limit,
      skip: offset,
      order: { createdAt: "DESC" },
    });

    return { users, total };
  },
};
```

## JSONB Columns

For schemaless or semi-structured data, use JSONB columns:

```typescript
@Entity("dataRecords")
export class DataRecord {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  datasetId!: string;

  @Column({ type: "int" })
  rowIndex!: number;

  @Column({ type: "jsonb" })
  data!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
```

### Querying JSONB

Use TypeORM's QueryBuilder for JSONB operations:

```typescript
// Text accessor: data->>'key' returns text
const rows = await repo
  .createQueryBuilder("r")
  .where("r.data->>'status' = :status", { status: "active" })
  .getMany();

// Numeric comparison: cast to numeric
const rows = await repo
  .createQueryBuilder("r")
  .where("(r.data->>'revenue')::numeric > :min", { min: 1000 })
  .getMany();

// Containment: @> checks if JSONB contains another JSONB
const rows = await repo
  .createQueryBuilder("r")
  .where("r.data @> :filter", { filter: JSON.stringify({ category: "tech" }) })
  .getMany();

// Check key existence
const rows = await repo
  .createQueryBuilder("r")
  .where("r.data ? :key", { key: "email" })
  .getMany();

// Aggregate on JSONB values
const result = await repo
  .createQueryBuilder("r")
  .select("AVG((r.data->>'revenue')::numeric)", "avgRevenue")
  .getRawOne();
```

### JSONB Indexes (GIN)

Add GIN indexes for fast JSONB lookups:

```sql
CREATE INDEX idx_dataRecords_data_gin ON "dataRecords" USING GIN (data);
```

Or via TypeORM migration:

```typescript
await queryRunner.query(
  `CREATE INDEX "idx_dataRecords_data_gin" ON "dataRecords" USING GIN (data)`
);
```

## pgvector — Vector Similarity

For embedding-based search, use the pgvector extension:

```typescript
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("textChunks")
export class TextChunk {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  datasetId!: string;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "vector", length: 768, nullable: true })
  embedding?: number[];
}
```

### Cosine Similarity Search

```typescript
const embedding = await getEmbedding(queryText); // Float32 array from AI adapter

const results = await dataSource.query(
  `SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity
   FROM "textChunks"
   WHERE "datasetId" = $2
   ORDER BY embedding <=> $1::vector
   LIMIT $3`,
  [JSON.stringify(embedding), datasetId, 10]
);
```

### HNSW Index for Performance

```sql
CREATE INDEX idx_textChunks_embedding_hnsw
  ON "textChunks"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

## Using Tables in Actions

Import and use the table in your action handlers:

```typescript
import { defineAction } from "core.lib/broker";
import { UserTable } from "../../db";

export default defineAction({
  async handler(ctx) {
    const { email, password } = ctx.params;

    // Find user
    const user = await UserTable.findByEmail(email);

    if (!user) {
      throw new Error("User not found");
    }

    return { userId: user.id };
  },
});
```

## Database Helper Functions

The `core.lib/database` module provides:

### `createDataSource(config)`

Creates a TypeORM `DataSource` instance.

```typescript
import { createDataSource } from "core.lib/database";

const dataSource = createDataSource({
  database: "analysis_db",
  entities: [User, DataRecord, TextChunk],
  synchronize: false, // Use migrations in production
});

await dataSource.initialize();
console.log(dataSource.isInitialized); // true
await dataSource.destroy();
```

### `getDataSource()`

Get the current initialized DataSource for repository access.

```typescript
import { getDataSource } from "core.lib/database";

const repo = getDataSource().getRepository(User);
const users = await repo.find();
```

## Migrations

Use TypeORM migrations for schema changes in production:

```bash
# Generate a migration from entity changes
npx typeorm migration:generate -d src/data-source.ts src/migrations/AddUserTable

# Run pending migrations
npx typeorm migration:run -d src/data-source.ts

# Revert last migration
npx typeorm migration:revert -d src/data-source.ts
```

During development, you can enable `synchronize: true` in the DataSource config to auto-sync schema from entities. **Never use `synchronize: true` in production.**

## Best Practices

1. **One database per microservice**: Each microservice should have its own database for isolation.

2. **Use indexes**: Add indexes to frequently queried columns. Use GIN indexes for JSONB columns and HNSW indexes for vector columns.

3. **Type everything**: Use TypeORM entity classes with proper column types for type safety.

4. **Centralize queries**: Keep all queries in the table file for consistency.

5. **Handle errors**: Always handle database errors gracefully in your actions.

6. **Use transactions**: For multi-table operations, use TypeORM's `QueryRunner`:

```typescript
import { getDataSource } from "core.lib/database";

async function transferBook(fromUserId: string, toUserId: string, bookId: string) {
  const queryRunner = getDataSource().createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    await queryRunner.manager
      .createQueryBuilder()
      .update("books")
      .set({ ownerId: toUserId })
      .where("id = :bookId", { bookId })
      .execute();

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

7. **Use camelCase**: All table names and column names use camelCase (e.g., `dataRecords`, `createdAt`, `datasetId`). TypeORM will auto-quote identifiers to preserve casing in PostgreSQL.

8. **Prefer QueryBuilder for complex queries**: Use TypeORM's QueryBuilder for joins, subqueries, JSONB operations, and raw SQL when the repository API is insufficient.
