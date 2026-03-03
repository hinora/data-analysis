# Gemini AI Adapter

## Overview

The Gemini adapter integrates the Google Generative AI API as an alternative AI provider alongside Ollama. It implements the full `AIAdapter` interface: text generation, JSON generation, chat with tool-calling, and embeddings.

## Configuration

| Environment Variable | Description | Default |
|---|---|---|
| `AI_PROVIDER` | Set to `"gemini"` to use Gemini | `"ollama"` |
| `GEMINI_API_KEY` | Google Generative AI API key (required) | — |
| `GEMINI_MODEL` | Default model | `gemini-2.0-flash` |

## Architecture

```mermaid
graph TD
    A[createAIAdapter] -->|AI_PROVIDER=gemini| B[GeminiAdapter]
    A -->|AI_PROVIDER=ollama| C[OllamaAdapter]
    B --> D[Google Generative AI SDK]
    C --> E[Ollama Local Server]
    B --> F[AIAdapter Interface]
    C --> F
```

## Method Mapping

| AIAdapter Method | Gemini SDK Call | Notes |
|---|---|---|
| `generateText` | `model.generateContent()` | System prompt via `systemInstruction` |
| `generateJSON` | `model.generateContent()` | Uses `responseMimeType: "application/json"` |
| `chatWithTools` | `model.generateContent()` | Tools as `functionDeclarations`; tool results as `functionResponse` parts |
| `generateEmbeddings` | `model.embedContent()` | Default model: `text-embedding-004` |
| `isAvailable` | Sends a ping prompt | Returns `false` on failure |

## Tool-Calling Flow

```mermaid
sequenceDiagram
    participant Action as sendMessage Action
    participant Adapter as GeminiAdapter
    participant API as Gemini API

    Action->>Adapter: chatWithTools(messages, tools)
    Adapter->>Adapter: Convert messages to Gemini Content[]
    Adapter->>Adapter: Convert ToolDefinitions to functionDeclarations
    Adapter->>API: generateContent(contents, tools)
    API-->>Adapter: Response with functionCall parts
    Adapter->>Adapter: Extract ToolCall[] from parts
    Adapter-->>Action: { content, toolCalls }
    Note over Action: Execute tools, add functionResponse
    Action->>Adapter: chatWithTools(updated messages, tools)
    Adapter->>API: generateContent(contents with functionResponse)
    API-->>Adapter: Final text response
    Adapter-->>Action: { content, toolCalls: [] }
```

## Message Role Mapping

| Internal Role | Gemini Role | Notes |
|---|---|---|
| `system` | `systemInstruction` | Not a content entry; passed as model config |
| `user` | `user` | Direct mapping |
| `assistant` | `model` | May include `functionCall` parts |
| `tool` | `function` (user role) | Contains `functionResponse` parts |

## Retry & Resilience

- Max **3 retries** with exponential backoff (1s, 2s, 4s) — same as Ollama adapter.
- `createAIAdapterWithFallback()` tries Gemini first and falls back to Ollama if unavailable.

## Usage

```typescript
// Via factory (recommended)
const ai = createAIAdapter({ provider: "gemini" });

// Or set AI_PROVIDER=gemini in .env and use default
const ai = createAIAdapter();
```
