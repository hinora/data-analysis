/**
 * Ollama AI Adapter
 *
 * Implementation of AIAdapter for local Ollama inference.
 * Default model: qwen3:14b (per plan.md)
 * Per constitution: max 3 retries with exponential backoff
 */

import { Ollama } from "ollama";
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

const DEFAULT_MODEL = "qwen3:8b";
const DEFAULT_HOST = "http://localhost:11434";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Strip think-tag reasoning from model output.
 * Qwen3 and similar reasoning models wrap internal reasoning in `<think>...</think>` tags.
 *
 * Handles three cases:
 * 1. Standard: `<think>reasoning</think>actual response`
 * 2. Orphaned close: `reasoning</think>actual response` (Ollama may strip the opening tag)
 * 3. Unclosed open: `actual response<think>reasoning...` (rare, defensive)
 */
function stripThinkTags(content: string): string {
  // 1. Standard paired tags
  let result = content.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // 2. Orphaned </think> without opening — strip everything before and including it
  result = result.replace(/^[\s\S]*?<\/think>/gi, "");

  // 3. Unclosed <think> — strip from tag to end
  result = result.replace(/<think>[\s\S]*$/gi, "");

  return result.trim();
}

export interface OllamaAdapterOptions {
  /** Host URL (default: http://localhost:11434) */
  host?: string;
  /** Default model (default: qwen3:14b) */
  model?: string;
}

/**
 * Ollama adapter for local AI inference
 */
export class OllamaAdapter implements AIAdapter {
  private client: Ollama;
  private config: AIProviderConfig;

  constructor(options: OllamaAdapterOptions = {}) {
    const host = options.host || process.env.OLLAMA_HOST || DEFAULT_HOST;
    const model = options.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;

    this.client = new Ollama({ host });
    this.config = {
      defaultModel: model,
      host,
      provider: "ollama",
    };
  }

  async generateJSON<T>(
    params: GenerateJSONParams<T>,
  ): Promise<GenerateJSONResult<T>> {
    const startTime = Date.now();
    const model = params.model || this.config.defaultModel;

    // Build messages array
    const messages: {
      content: string;
      role: "assistant" | "system" | "user";
    }[] = [];

    if (params.systemPrompt) {
      messages.push({ content: params.systemPrompt, role: "system" });
    }

    if (params.messages) {
      messages.push(...params.messages);
    }

    // Add JSON instruction to prompt
    const jsonPrompt = `${params.prompt}\n\nRespond with valid JSON only. No markdown, no code blocks, just raw JSON.`;
    messages.push({ content: jsonPrompt, role: "user" });

    const response = await this.executeWithRetry(async () => {
      return this.client.chat({
        format: "json",
        messages,
        model,
        options: {
          temperature: params.temperature ?? 0.7,
        },
      });
    });

    const durationMs = Date.now() - startTime;
    const rawResponse = response.message.content;

    // Parse JSON response
    let data: T;
    try {
      data = JSON.parse(rawResponse) as T;
    } catch {
      throw new Error(
        `Failed to parse JSON response: ${rawResponse.substring(0, 200)}`,
      );
    }

    // Estimate tokens (Ollama provides eval_count for completion tokens)
    const completionTokens = response.eval_count || 0;
    const promptTokens = response.prompt_eval_count || 0;

    return {
      completionTokens,
      data,
      durationMs,
      model,
      promptTokens,
      rawResponse,
      totalTokens: promptTokens + completionTokens,
    };
  }

  async generateText(params: GenerateTextParams): Promise<GenerateTextResult> {
    const startTime = Date.now();
    const model = params.model || this.config.defaultModel;

    // Build messages array
    const messages: {
      content: string;
      role: "assistant" | "system" | "user";
    }[] = [];

    if (params.systemPrompt) {
      messages.push({ content: params.systemPrompt, role: "system" });
    }

    if (params.messages) {
      messages.push(...params.messages);
    }

    messages.push({ content: params.prompt, role: "user" });

    const response = await this.executeWithRetry(async () => {
      return this.client.chat({
        messages,
        model,
        options: {
          temperature: params.temperature ?? 0.7,
          num_ctx: 32768,
        },
      });
    });

    const durationMs = Date.now() - startTime;

    const completionTokens = response.eval_count || 0;
    const promptTokens = response.prompt_eval_count || 0;

    return {
      completionTokens,
      content: stripThinkTags(response.message.content),
      durationMs,
      model,
      promptTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  async chatWithTools(
    params: ChatWithToolsParams,
  ): Promise<ChatWithToolsResponse> {
    const startTime = Date.now();
    const model = params.model || this.config.defaultModel;

    // Convert messages to Ollama format, preserving tool_calls and tool_name
    const messages = params.messages.map((msg) => {
      const ollamaMsg: {
        content: string;
        role: "assistant" | "system" | "tool" | "user";
        tool_calls?: {
          function: { arguments: Record<string, unknown>; name: string };
        }[];
        tool_name?: string;
      } = {
        content: msg.content,
        role: msg.role as "assistant" | "system" | "tool" | "user",
      };

      // Preserve tool_calls on assistant messages so the model sees its own requests
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        ollamaMsg.tool_calls = msg.toolCalls.map((tc) => ({
          function: {
            arguments: tc.function.arguments,
            name: tc.function.name,
          },
        }));
      }

      // Preserve tool_name on tool-role messages
      if (msg.role === "tool" && msg.toolName) {
        ollamaMsg.tool_name = msg.toolName;
      }

      return ollamaMsg;
    });

    // Convert tool definitions to Ollama format
    const tools = params.tools.map((tool) => ({
      function: {
        description: tool.function.description,
        name: tool.function.name,
        parameters: tool.function.parameters,
      },
      type: "function" as const,
    }));

    // console.log("Ollama chatWithTools request:", { messages });
    const response = await this.executeWithRetry(async () => {
      return this.client.chat({
        messages,
        model,
        options: {
          num_ctx: 8192 * 2,
          temperature: params.temperature ?? 0.3,
        },
        stream: false,
        tools,
      });
    });

    // console.log("Ollama response with tools:", response);

    const durationMs = Date.now() - startTime;
    const completionTokens = response.eval_count || 0;
    const promptTokens = response.prompt_eval_count || 0;

    // Extract tool calls from response
    const toolCalls: ToolCall[] = (response.message.tool_calls || []).map(
      (tc: {
        function: { arguments: Record<string, unknown>; name: string };
      }) => ({
        function: {
          arguments: tc.function.arguments,
          name: tc.function.name,
        },
      }),
    );

    return {
      completionTokens,
      content: stripThinkTags(response.message.content || ""),
      durationMs,
      model,
      promptTokens,
      toolCalls,
      totalTokens: promptTokens + completionTokens,
    };
  }

  async generateEmbeddings(
    params: GenerateEmbeddingsParams,
  ): Promise<GenerateEmbeddingsResult> {
    const startTime = Date.now();
    const model =
      params.model || process.env.EMBEDDING_MODEL || "nomic-embed-text";

    const response = await this.executeWithRetry(async () => {
      return this.client.embed({
        input: params.input,
        model,
      });
    });

    const durationMs = Date.now() - startTime;
    const dimensions =
      response.embeddings.length > 0 ? response.embeddings[0].length : 0;

    return {
      dimensions,
      durationMs,
      embeddings: response.embeddings,
      model,
    };
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Ollama is running by listing models
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute a function with exponential backoff retry
   * Per constitution: max 3 retries
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < MAX_RETRIES) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = BASE_DELAY_MS * 2 ** attempt;
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
