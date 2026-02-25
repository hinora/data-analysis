# Database Integration

This document explains how to set up and use MongoDB with Mongoose in your microservices.

## Overview

Each microservice connects to its own dedicated MongoDB database. The `core.lib` provides helper functions to manage database connections.

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env` in your microservice directory and configure the MongoDB connection:

```bash
# Option 1: Configure host and port (database name is set in code)
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_USER=myuser
MONGODB_PASSWORD=mypassword

# Option 2: Use a full connection URI
AUTH_DB_URI=mongodb://localhost:27017/auth_db
BOOK_DB_URI=mongodb://localhost:27017/book_db
```

### 2. Connect in app.ts

The database connection is initialized in each microservice's `app.ts`:

```typescript
import { createDatabase, createDatabaseUri } from "core.lib/database";

// Create database connection for your microservice
const db = createDatabase({
  uri: process.env.MY_DB_URI || createDatabaseUri("my_database"),
});

// Connect to database before starting the app
db.connect()
  .then(() => run(app.broker))
  .catch((err: Error) => console.error(`Error occurred! ${err.message}`));
```

## Database Folder Structure

Each microservice should have a `db` folder with table files:

```
microservice.name/
├── db/
│   ├── index.ts          # Export all tables
│   ├── user.table.ts     # User schema and queries
│   └── book.table.ts     # Book schema and queries
├── services/
│   └── ...
└── app.ts
```

## Creating Table Files

Each table file should contain:
1. TypeScript interfaces for the document
2. Mongoose schema definition
3. Model creation
4. Query functions (CRUD operations)

### Example Table File

```typescript
/**
 * User Table - Schema and Query Functions
 */
import mongoose, { Schema, Document, Model } from "mongoose";

// ============================================
// Types
// ============================================

export interface IUser {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {}

// ============================================
// Schema
// ============================================

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// ============================================
// Model
// ============================================

export const UserModel = mongoose.model<IUserDocument>("User", userSchema);

// ============================================
// Query Functions
// ============================================

export const UserTable = {
  async create(data: Omit<IUser, "createdAt" | "updatedAt" | "isActive">) {
    const user = new UserModel(data);
    return user.save();
  },

  async findById(id: string) {
    return UserModel.findById(id);
  },

  async findByEmail(email: string) {
    return UserModel.findOne({ email: email.toLowerCase() });
  },

  async updateById(id: string, data: Partial<IUser>) {
    return UserModel.findByIdAndUpdate(id, data, { new: true });
  },

  async deleteById(id: string) {
    const result = await UserModel.findByIdAndDelete(id);
    return !!result;
  },

  async list(options: { limit?: number; offset?: number } = {}) {
    const { limit = 10, offset = 0 } = options;
    
    const [users, total] = await Promise.all([
      UserModel.find().skip(offset).limit(limit).sort({ createdAt: -1 }),
      UserModel.countDocuments(),
    ]);

    return { users, total };
  },
};
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

    return { userId: user._id };
  },
});
```

## Database Helper Functions

The `core.lib/database` module provides:

### `createDatabase(config)`

Creates a database connection object.

```typescript
import { createDatabase } from "core.lib/database";

const db = createDatabase({
  uri: "mongodb://localhost:27017/mydb",
  options: {
    maxPoolSize: 10,
  },
});

await db.connect();
console.log(db.isConnected()); // true
await db.disconnect();
```

### `createDatabaseUri(dbName)`

Generates a MongoDB URI from environment variables.

```typescript
import { createDatabaseUri } from "core.lib/database";

// Uses MONGODB_HOST, MONGODB_PORT, MONGODB_USER, MONGODB_PASSWORD env vars
const uri = createDatabaseUri("auth_db");
// Returns: mongodb://localhost:27017/auth_db
// Or with auth: mongodb://user:password@localhost:27017/auth_db?authSource=admin
```

### `getMongoose()`

Get the mongoose instance for advanced operations.

### `getConnection()`

Get the current mongoose connection.

## Best Practices

1. **One database per microservice**: Each microservice should have its own database for isolation.

2. **Use indexes**: Add indexes to frequently queried fields.

3. **Type everything**: Use TypeScript interfaces for type safety.

4. **Centralize queries**: Keep all queries in the table file for consistency.

5. **Handle errors**: Always handle database errors gracefully in your actions.

6. **Use transactions**: For multi-document operations, use MongoDB transactions.

```typescript
import { getMongoose } from "core.lib/database";

async function transferBook(fromUserId: string, toUserId: string, bookId: string) {
  const session = await getMongoose().startSession();
  session.startTransaction();
  
  try {
    // Perform operations with session
    await BookModel.updateOne({ _id: bookId }, { ownerId: toUserId }, { session });
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```
