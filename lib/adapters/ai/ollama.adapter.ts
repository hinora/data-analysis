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
  GenerateJSONParams,
  GenerateJSONResult,
  GenerateTextParams,
  GenerateTextResult,
} from "./types";

const DEFAULT_MODEL = "qwen3:14b";
const DEFAULT_HOST = "http://localhost:11434";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

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
      content: response.message.content,
      durationMs,
      model,
      promptTokens,
      totalTokens: promptTokens + completionTokens,
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
