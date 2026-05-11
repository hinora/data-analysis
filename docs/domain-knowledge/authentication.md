# Authentication System

## Overview

The authentication microservice (`microservice.auth`) provides user registration, login, JWT-based token verification, and profile management for the Data Analysis Platform.

## Architecture

```mermaid
graph TB
    Client[Client / Frontend]
    Gateway[API Gateway<br/>microservice.proxy]
    Auth[Auth Microservice<br/>microservice.auth]
    DB[(auth_db<br/>PostgreSQL)]

    Client -->|HTTP Request| Gateway
    Gateway -->|Route /auth/*| Auth
    Auth -->|TypeORM| DB

    subgraph "Token Verification Flow"
        OtherService[Any Protected Service]
        OtherService -->|ctx.call auth.verifyToken| Auth
    end
```

## Service: `auth`

**Base REST path:** `/auth`

### Actions

| Action | Type | REST Endpoint | Description |
|--------|------|---------------|-------------|
| `auth.register` | External | `POST /auth/register` | Create new user account |
| `auth.login` | External | `POST /auth/login` | Authenticate with credentials |
| `auth.verifyToken` | Internal | — | Validate JWT and return user |
| `auth.forgotPassword` | External | `POST /auth/forgot-password` | Initiate password reset |
| `auth.getProfile` | External (Auth) | `GET /auth/profile` | Get current user profile |
| `auth.updateProfile` | External (Auth) | `PUT /auth/profile` | Update profile fields |

### Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant G as Gateway
    participant A as Auth Service
    participant DB as auth_db

    Note over C,DB: Registration
    C->>G: POST /auth/register {email, password, nickName}
    G->>A: auth.register
    A->>DB: Check email uniqueness
    A->>DB: Insert user (bcrypt hash)
    A->>A: Sign JWT
    A-->>C: {token, user}

    Note over C,DB: Login
    C->>G: POST /auth/login {email, password}
    G->>A: auth.login
    A->>DB: Find user by email
    A->>A: bcrypt.compare password
    A->>A: Sign JWT
    A-->>C: {token, user}

    Note over C,DB: Authenticated Request
    C->>G: GET /auth/profile (Bearer token)
    G->>A: auth.getProfile (meta.token)
    A->>A: defineAction auth hook
    A->>A: auth.verifyToken (self-call)
    A->>DB: Find user by id
    A-->>A: {valid, user}
    A-->>C: {id, email, nickName, ...}
```

### Token Verification (Internal)

The `auth.verifyToken` action is the backbone of the authentication system. It is called automatically by the `defineAction` authentication hook whenever any service defines `authentication: true`.

**Flow:**
1. The gateway forwards the JWT token in `ctx.meta.token`
2. The `defineAction` hook intercepts the call before the handler
3. It calls `auth.verifyToken` with the token
4. `verifyToken` decodes the JWT, looks up the user in the database
5. Returns the user object, which is set on `ctx.meta.user`
6. The original handler executes with `ctx.meta.user` available

### Database Schema

**Table: `users`**

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `email` | VARCHAR(255) | Unique, indexed (`idx_users_email`) |
| `password` | VARCHAR(255) | bcrypt hash |
| `nickName` | VARCHAR(100) | — |
| `isActive` | BOOLEAN | Default: `true` |
| `isVerified` | BOOLEAN | Default: `false` |
| `photo` | VARCHAR(500) | Nullable |
| `createdAt` | TIMESTAMPTZ | Auto-generated |
| `updatedAt` | TIMESTAMPTZ | Auto-updated |

### JWT Configuration

- **Secret:** `JWT_SECRET` env var (default: `dev-jwt-secret-change-in-production`)
- **Expiration:** `JWT_EXPIRES_IN` env var (default: `7d`)
- **Payload:** `{ id, email }`

### Entity Ownership Verification

All REST endpoints enforce entity ownership through the session hierarchy:

```mermaid
graph TD
    User[User<br/>auth_db.users]
    Session[Session<br/>analysis_db.sessions<br/>userId column]
    Conversation[Conversation<br/>analysis_db.conversations<br/>sessionId FK]
    Dataset[Dataset<br/>data_db.datasets<br/>sessionId column]

    User -->|owns| Session
    Session -->|contains| Conversation
    Session -->|contains| Dataset
```

#### Dedicated Verification Actions

Ownership verification is centralized in three internal actions:

| Action | Microservice | Params | Description |
|--------|-------------|--------|-------------|
| `session.verifySessionOwnership` | analysis | `sessionId`, `userId` | Checks session exists and belongs to user |
| `conversation.verifyConversationOwnership` | analysis | `conversationId`, `userId` | Checks conversation exists and its session belongs to user |
| `dataset.verifyDatasetOwnership` | data | `datasetId`, `userId` | Checks dataset exists, then calls `session.verifySessionOwnership` |

All verification actions throw 404 "not found" for unauthorized access (prevents information disclosure).

**Analysis microservice (sessions, conversations, chat):**
- Session CRUD actions filter by `userId: ctx.meta.user.id` directly
- Conversation/chat actions call `session.verifySessionOwnership({ sessionId, userId: ctx.meta.user.id })`

**Data microservice (datasets, uploads, metadata):**
- All REST actions call `session.verifySessionOwnership({ sessionId, userId: ctx.meta.user.id })` cross-service
- The `userId` is passed explicitly (not relying on meta forwarding)

**Internal actions (no REST):**
- Tool actions (sampleData, aggregate, etc.) are only called by other services
- The auth hook skips when `ctx.caller !== "proxy"` (internal calls)
- Ownership is verified by the parent REST action that initiated the chain

### Security Considerations

- Passwords are hashed with **bcryptjs** (10 rounds)
- The `forgotPassword` action never reveals whether an email exists
- Login returns the same error message for wrong email and wrong password
- Inactive accounts are rejected at login and token verification
- JWT tokens are verified and user existence is confirmed on every authenticated request

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_DB_URI` | `postgresql://postgres:postgres@localhost:5432/auth_db` | Database connection string |
| `JWT_SECRET` | `dev-jwt-secret-change-in-production` | JWT signing secret |
| `JWT_EXPIRES_IN` | `7d` | JWT token expiration |
