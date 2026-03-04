# Conversation Management

## Overview

A **Conversation** is a single chat thread within a session. The system prompt is generated dynamically by the chat flow (`chat.sendMessage`) before each AI call so prompt logic can evolve without recreating conversations.

## Data Model

```mermaid
erDiagram
    Session ||--o{ Conversation : has
    Conversation ||--o{ ChatMessage : contains

    Conversation {
        uuid id PK
        uuid sessionId FK
        varchar(500) name
        text systemPrompt
        integer messageCount
        timestamp createdAt
        timestamp updatedAt
    }
```

- `sessionId` — foreign key to `Session`, cascades on delete
- `systemPrompt` — latest generated prompt snapshot (refreshed in `chat.sendMessage`)
- `messageCount` — denormalized counter of persisted chat messages (user + assistant)

## REST Endpoints

All conversation endpoints are under the `/api/conversations` base path.

| Operation             | Method   | URL                                  | Action                                |
|-----------------------|----------|--------------------------------------|---------------------------------------|
| Create conversation   | `POST`   | `/api/conversations`                 | `conversation.createConversation`     |
| List conversations    | `GET`    | `/api/conversations`                 | `conversation.listConversations`      |
| Get conversation      | `GET`    | `/api/conversations/:id`             | `conversation.getConversation`        |
| Delete conversation   | `DELETE` | `/api/conversations/:id`             | `conversation.deleteConversation`     |
| Rename conversation   | `PATCH`  | `/api/conversations/:id/rename`      | `conversation.renameConversation`     |

### Create Conversation

Auto-generates a name like `Conversation — Feb 28, 14:30` when no name is provided.

**Flow:**

```mermaid
sequenceDiagram
    participant Client
    participant ConversationSvc as conversation service
    participant SessionSvc as session service

    Client->>ConversationSvc: POST /conversations { sessionId, name? }
    ConversationSvc->>ConversationSvc: Verify session exists
    ConversationSvc->>ConversationSvc: Save empty Conversation metadata
    ConversationSvc->>SessionSvc: ctx.call("session.updateSessionStatus", { trigger: "conversation-created" })
    ConversationSvc-->>Client: Conversation object
```

**Params:**
- `sessionId` (uuid, required)
- `name` (string, optional, 1–500 chars)

**Returns:** `{ id, sessionId, name, systemPrompt, messageCount, createdAt }`

### System Prompt Construction

The system prompt includes:
1. **Mission statement** — defines the AI's role as a data analysis assistant
2. **Response format rules** — cite datasets/columns, include confidence scores, show reasoning
3. **Dataset context** — for each dataset: name, type, format, row count, column mappings (camelCase, original name, detected type), AI metadata (description, summary, topics)
4. **Available tools** — structured data tools (aggregate, sum, avg, count, etc.) and unstructured text tools (semantic search, summarize, extract entities, etc.)

This prompt is built in `chat.sendMessage` before every message handling cycle (not at `conversation.createConversation` time), so dataset/tool changes are picked up automatically.

### List Conversations

Returns conversations for a given session, sorted by `createdAt DESC`.

**Query params:**
- `sessionId` (uuid, required)

**Returns:** Array of `{ id, sessionId, name, messageCount, createdAt, updatedAt }` (excludes `systemPrompt` for efficiency).

### Get Conversation

**Params:**
- `id` (uuid, required)

**Returns:** Full conversation including a freshly generated `systemPrompt` (rebuilt from latest datasets at read time). Throws `404 CONVERSATION_NOT_FOUND` if not found.

### Delete Conversation

Cascade-deletes all `ChatMessage` and `AILog` records for the conversation, then decrements the session's `conversationCount`.

**Params:**
- `id` (uuid, required)

**Returns:** `{ success: true, id }`

### Rename Conversation

**Params:**
- `id` (uuid, required)
- `name` (string, required, 1–500 chars)

**Returns:** Updated conversation object.
