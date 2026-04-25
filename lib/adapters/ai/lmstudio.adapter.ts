/**
 * LM Studio AI Adapter
 *
 * Implementation of AIAdapter for local LM Studio inference using its
 * OpenAI-compatible REST API (`/v1/chat/completions`, `/v1/embeddings`,
 * `/v1/models`).
 *
 * LM Studio supports tool/function calling, JSON mode (`response_format`),
 * streaming via SSE, and a `reasoning_content` delta field for reasoning
 * models (e.g. DeepSeek-R1, Qwen3 think variants). The adapter forwards
 * those reasoning chunks to `onReasoning` line-by-line, mirroring the
 * Ollama/Gemini adapters.
 *
 * Per constitution: max 3 retries with exponential backoff on failure.
 */

import type {
  AIAdapter,
  AIProviderConfig,
  ChatWithToolsParams,
  ChatWithToolsResponse,
  GenerateEmbeddingsParams,
  GenerateEmbeddingsResult,
  GenerateJSONParams,
  GenerateJSONResult,
  GenerateTextParams,
  GenerateTextResult,
  ToolCall,
} from "./types";

const DEFAULT_HOST = "http://localhost:1234";
const DEFAULT_MODEL = "lmstudio-community/qwen2.5-7b-instruct";
const DEFAULT_EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// OpenAI-compatible wire types (subset that LM Studio implements)
// ---------------------------------------------------------------------------

interface OpenAIToolCallWire {
  function: {
    arguments: string;
    name: string;
  };
  id?: string;
  index?: number;
  type?: "function";
}

interface OpenAIChatMessageWire {
  content: string | null;
  reasoning_content?: string | null;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: OpenAIToolCallWire[];
}

interface OpenAIChatChoiceWire {
  finish_reason?: string;
  index: number;
  message: OpenAIChatMessageWire;
}

interface OpenAIUsageWire {
  completion_tokens?: number;
  prompt_tokens?: number;
  total_tokens?: number;
}

interface OpenAIChatResponseWire {
  choices: OpenAIChatChoiceWire[];
  model?: string;
  usage?: OpenAIUsageWire;
}

interface OpenAIChatStreamDeltaWire {
  content?: string | null;
  reasoning_content?: string | null;
  role?: string;
  tool_calls?: OpenAIToolCallWire[];
}

interface OpenAIChatStreamChoiceWire {
  delta: OpenAIChatStreamDeltaWire;
  finish_reason?: string;
  index: number;
}

interface OpenAIChatStreamChunkWire {
  choices: OpenAIChatStreamChoiceWire[];
  model?: string;
  usage?: OpenAIUsageWire;
}

interface OpenAIEmbeddingItemWire {
  embedding: number[];
  index: number;
}

interface OpenAIEmbeddingResponseWire {
  data: OpenAIEmbeddingItemWire[];
  model?: string;
  usage?: OpenAIUsageWire;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface LMStudioAdapterOptions {
  /** API key (LM Studio ignores it but accepts any non-empty value) */
  apiKey?: string;
  /** Host URL (default: http://localhost:1234) */
  host?: string;
  /** Default model name as registered in LM Studio */
  model?: string;
}

/**
 * LM Studio adapter for local AI inference via the OpenAI-compatible REST API.
 */
export class LMStudioAdapter implements AIAdapter {
  private apiKey: string;
  private config: AIProviderConfig;
  private host: string;

  constructor(options: LMStudioAdapterOptions = {}) {
    const rawHost = options.host || process.env.LM_STUDIO_HOST || DEFAULT_HOST;
    const model = options.model || process.env.LM_STUDIO_MODEL || DEFAULT_MODEL;
    const apiKey =
      options.apiKey || process.env.LM_STUDIO_API_KEY || "lm-studio";

    // Strip trailing slashes from the host without using a regex (avoid ReDoS
    // on hostile env values with many trailing slashes).
    let host = rawHost;
    while (host.length > 0 && host.charCodeAt(host.length - 1) === 47) {
      host = host.slice(0, -1);
    }

    this.apiKey = apiKey;
    this.host = host;
    this.config = {
      apiKey,
      defaultModel: model,
      host,
      provider: "lmstudio",
    };
  }

  async chatWithTools(
    params: ChatWithToolsParams,
  ): Promise<ChatWithToolsResponse> {
    const startTime = Date.now();
    const model = params.model || this.config.defaultModel;

    const messages = params.messages.map((msg) => {
      const wire: OpenAIChatMessageWire = {
        content: msg.content,
        role: msg.role,
      };

      if (
        msg.role === "assistant" &&
        msg.toolCalls &&
        msg.toolCalls.length > 0
      ) {
        wire.tool_calls = msg.toolCalls.map((tc, idx) => ({
          function: {
            arguments: JSON.stringify(tc.function.arguments ?? {}),
            name: tc.function.name,
          },
          id: tc.id || `call_${idx}`,
          type: "function" as const,
        }));
      }

      if (msg.role === "tool") {
        wire.tool_call_id = msg.toolCallId || msg.toolName || "tool_call";
      }

      return wire;
    });

    const tools =
      params.tools.length > 0
        ? params.tools.map((tool) => ({
            function: {
              description: tool.function.description,
              name: tool.function.name,
              parameters: tool.function.parameters,
            },
            type: "function" as const,
          }))
        : undefined;

    if (params.onReasoning || params.onContent) {
      return this.chatWithToolsStreaming(
        messages,
        tools,
        model,
        params.temperature ?? 0.3,
        params.onReasoning,
        params.onContent,
        startTime,
      );
    }

    const body: Record<string, unknown> = {
      messages,
      model,
      stream: false,
      temperature: params.temperature ?? 0.3,
    };
    if (tools) {
      body.tools = tools;
    }

    const response = await this.executeWithRetry(async () =>
      this.postJSON<OpenAIChatResponseWire>("/v1/chat/completions", body),
    );

    const durationMs = Date.now() - startTime;
    const choice = response.choices[0];
    const message = choice?.message;
    const usage = response.usage;

    const toolCalls: ToolCall[] = (message?.tool_calls || []).map((tc) => ({
      function: {
        arguments: parseToolArguments(tc.function.arguments),
        name: tc.function.name,
      },
      id: tc.id,
    }));

    const content = message?.content || "";
    const reasoning = message?.reasoning_content
      ? message.reasoning_content.trim() || null
      : null;

    return {
      completionTokens: usage?.completion_tokens || 0,
      content: content.trim(),
      durationMs,
      model: response.model || model,
      promptTokens: usage?.prompt_tokens || 0,
      reasoning,
      toolCalls,
      totalTokens: usage?.total_tokens || 0,
    };
  }

  async generateEmbeddings(
    params: GenerateEmbeddingsParams,
  ): Promise<GenerateEmbeddingsResult> {
    const startTime = Date.now();
    const model =
      params.model || process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;

    const response = await this.executeWithRetry(async () =>
      this.postJSON<OpenAIEmbeddingResponseWire>("/v1/embeddings", {
        input: params.input,
        model,
      }),
    );

    // OpenAI returns embeddings keyed by `index`; sort to preserve input order.
    const sorted = [...(response.data || [])].sort((a, b) => a.index - b.index);
    const embeddings = sorted.map((e) => e.embedding);
    const dimensions = embeddings.length > 0 ? embeddings[0].length : 0;

    return {
      dimensions,
      durationMs: Date.now() - startTime,
      embeddings,
      model: response.model || model,
    };
  }

  async generateJSON<T>(
    params: GenerateJSONParams<T>,
  ): Promise<GenerateJSONResult<T>> {
    const startTime = Date.now();
    const model = params.model || this.config.defaultModel;

    const messages: OpenAIChatMessageWire[] = [];
    if (params.systemPrompt) {
      messages.push({ content: params.systemPrompt, role: "system" });
    }
    if (params.messages) {
      for (const m of params.messages) {
        messages.push({ content: m.content, role: m.role });
      }
    }
    const jsonPrompt = `${params.prompt}\n\nRespond with valid JSON only. No markdown, no code blocks, just raw JSON.`;
    messages.push({ content: jsonPrompt, role: "user" });

    const response = await this.executeWithRetry(async () =>
      this.postJSON<OpenAIChatResponseWire>("/v1/chat/completions", {
        messages,
        model,
        response_format: { type: "json_object" },
        stream: false,
        temperature: params.temperature ?? 0.7,
      }),
    );

    const durationMs = Date.now() - startTime;
    const usage = response.usage;
    const rawResponse = response.choices[0]?.message?.content || "";

    let data: T;
    try {
      data = JSON.parse(rawResponse) as T;
    } catch {
      throw new Error(
        `Failed to parse JSON response: ${rawResponse.substring(0, 200)}`,
      );
    }

    return {
      completionTokens: usage?.completion_tokens || 0,
      data,
      durationMs,
      model: response.model || model,
      promptTokens: usage?.prompt_tokens || 0,
      rawResponse,
      totalTokens: usage?.total_tokens || 0,
    };
  }

  async generateText(params: GenerateTextParams): Promise<GenerateTextResult> {
    const startTime = Date.now();
    const model = params.model || this.config.defaultModel;

    const messages: OpenAIChatMessageWire[] = [];
    if (params.systemPrompt) {
      messages.push({ content: params.systemPrompt, role: "system" });
    }
    if (params.messages) {
      for (const m of params.messages) {
        messages.push({ content: m.content, role: m.role });
      }
    }
    messages.push({ content: params.prompt, role: "user" });

    const response = await this.executeWithRetry(async () =>
      this.postJSON<OpenAIChatResponseWire>("/v1/chat/completions", {
        messages,
        model,
        stream: false,
        temperature: params.temperature ?? 0.7,
      }),
    );

    const durationMs = Date.now() - startTime;
    const usage = response.usage;
    const content = response.choices[0]?.message?.content || "";

    return {
      completionTokens: usage?.completion_tokens || 0,
      content,
      durationMs,
      model: response.model || model,
      promptTokens: usage?.prompt_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
    };
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.host}/v1/models`, {
        headers: this.buildHeaders(),
        method: "GET",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Streaming implementation of chatWithTools using SSE.
   * Forwards `reasoning_content` chunks to `onReasoning` line-by-line and
   * `content` chunks to `onContent` as they arrive.
   */
  private async chatWithToolsStreaming(
    messages: OpenAIChatMessageWire[],
    tools:
      | {
          function: {
            description: string;
            name: string;
            parameters: unknown;
          };
          type: "function";
        }[]
      | undefined,
    model: string,
    temperature: number,
    onReasoning: ((chunk: string) => void) | undefined,
    onContent: ((chunk: string) => void) | undefined,
    startTime: number,
  ): Promise<ChatWithToolsResponse> {
    const body: Record<string, unknown> = {
      messages,
      model,
      stream: true,
      temperature,
    };
    if (tools) {
      body.tools = tools;
    }

    const stream = await this.executeWithRetry(async () =>
      this.postSSE("/v1/chat/completions", body),
    );

    let fullContent = "";
    let completionTokens = 0;
    let promptTokens = 0;
    let totalTokens = 0;
    let reasoningLineBuffer = "";
    let actualModel: string | undefined;

    // Tool calls stream incrementally per-index in OpenAI's format. Accumulate
    // string-form arguments before parsing once at the end.
    const toolCallAccumulator = new Map<
      number,
      { id?: string; name: string; arguments: string }
    >();

    for await (const chunk of stream) {
      if (chunk.model) {
        actualModel = chunk.model;
      }
      if (chunk.usage) {
        completionTokens = chunk.usage.completion_tokens ?? completionTokens;
        promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
        totalTokens = chunk.usage.total_tokens ?? totalTokens;
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (!delta) continue;

      // ── Reasoning tokens ──
      if (
        typeof delta.reasoning_content === "string" &&
        delta.reasoning_content &&
        onReasoning
      ) {
        reasoningLineBuffer += delta.reasoning_content;
        let nlIdx = reasoningLineBuffer.indexOf("\n");
        while (nlIdx !== -1) {
          const line = reasoningLineBuffer.slice(0, nlIdx).trim();
          if (line) {
            onReasoning(line);
          }
          reasoningLineBuffer = reasoningLineBuffer.slice(nlIdx + 1);
          nlIdx = reasoningLineBuffer.indexOf("\n");
        }
      }

      // ── Content tokens ──
      if (typeof delta.content === "string" && delta.content) {
        fullContent += delta.content;
        if (onContent) {
          onContent(delta.content);
        }
      }

      // ── Tool calls ──
      if (delta.tool_calls && delta.tool_calls.length > 0) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const existing = toolCallAccumulator.get(idx) || {
            arguments: "",
            id: tc.id,
            name: "",
          };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (typeof tc.function?.arguments === "string") {
            existing.arguments += tc.function.arguments;
          }
          toolCallAccumulator.set(idx, existing);
        }
      }
    }

    if (reasoningLineBuffer.trim() && onReasoning) {
      onReasoning(reasoningLineBuffer.trim());
    }

    const toolCalls: ToolCall[] = [...toolCallAccumulator.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, tc]) => ({
        function: {
          arguments: parseToolArguments(tc.arguments),
          name: tc.name,
        },
        id: tc.id,
      }));

    return {
      completionTokens,
      content: fullContent.trim(),
      durationMs: Date.now() - startTime,
      model: actualModel || model,
      promptTokens,
      reasoning: null, // Already forwarded via callback
      toolCalls,
      totalTokens,
    };
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Execute a function with exponential backoff retry.
   * Per constitution: max 3 retries.
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * 2 ** attempt;
          await this.sleep(delay);
        }
      }
    }
    throw lastError;
  }

  private async postJSON<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${this.host}${path}`, {
      body: JSON.stringify(body),
      headers: this.buildHeaders(),
      method: "POST",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `LM Studio request to ${path} failed (${res.status} ${res.statusText}): ${text.substring(0, 500)}`,
      );
    }

    return (await res.json()) as T;
  }

  private async postSSE(
    path: string,
    body: Record<string, unknown>,
  ): Promise<AsyncGenerator<OpenAIChatStreamChunkWire>> {
    const res = await fetch(`${this.host}${path}`, {
      body: JSON.stringify(body),
      headers: { ...this.buildHeaders(), Accept: "text/event-stream" },
      method: "POST",
    });

    if (!res.ok || !res.body) {
      const text = res.body ? await res.text().catch(() => "") : "";
      throw new Error(
        `LM Studio stream request to ${path} failed (${res.status} ${res.statusText}): ${text.substring(0, 500)}`,
      );
    }

    return parseSSEStream(res.body);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Parse SSE response body into a stream of OpenAI-style chunk objects.
 * Handles partial frames split across reads and the terminating `[DONE]`.
 */
async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<OpenAIChatStreamChunkWire> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line ("\n\n").
      let frameEnd = buffer.indexOf("\n\n");
      while (frameEnd !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);

        for (const rawLine of frame.split("\n")) {
          const line = rawLine.trim();
          if (!line || !line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            yield JSON.parse(data) as OpenAIChatStreamChunkWire;
          } catch {
            // Skip malformed frames rather than aborting the stream.
          }
        }

        frameEnd = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Tool-call arguments are serialized JSON strings on the OpenAI wire format.
 * Parse to an object; fall back to an empty object on malformed payloads
 * (matches the lenient behavior of the other adapters).
 */
function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
