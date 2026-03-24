/**
 * AI Adapter Factory
 *
 * Creates AI adapters based on configuration.
 * Default provider: ollama (per plan.md)
 */

import {
  SUPPORTED_AI_PROVIDERS,
  type SupportedAIProvider,
} from "../../config/utils";
import { GeminiAdapter } from "./gemini.adapter";
import { OllamaAdapter } from "./ollama.adapter";
import type {
  AIAdapter,
  AIProviderType,
  CreateAIAdapterOptions,
} from "./types";

/** Default embedding dimensions used across the platform (nomic-embed-text / Gemini). */
export { EMBEDDING_DIMENSIONS } from "./constants";

export { GeminiAdapter } from "./gemini.adapter";
export { OllamaAdapter } from "./ollama.adapter";
export type {
  AIAdapter,
  AIMessage,
  AIMessageRole,
  AIMessageWithToolRole,
  AIMessageWithTools,
  AIProviderConfig,
  AIProviderType,
  ChatWithToolsParams,
  ChatWithToolsResponse,
  CreateAIAdapterOptions,
  GenerateEmbeddingsParams,
  GenerateEmbeddingsResult,
  GenerateJSONParams,
  GenerateJSONResult,
  GenerateTextParams,
  GenerateTextResult,
  Recommendation,
  ToolCall,
  ToolCallResult,
  ToolDefinition,
  ToolParameterSchema,
} from "./types";

/**
 * Get the default AI provider from environment.
 * Validates the provider value and throws if unsupported.
 */
function getDefaultProvider(): AIProviderType {
  const provider = process.env.AI_PROVIDER?.toLowerCase();

  if (!provider) {
    return "ollama";
  }

  if (!SUPPORTED_AI_PROVIDERS.includes(provider as SupportedAIProvider)) {
    throw new Error(
      `Unknown AI provider: "${process.env.AI_PROVIDER}". ` +
        `Supported providers: ${SUPPORTED_AI_PROVIDERS.join(", ")}`,
    );
  }

  return provider as AIProviderType;
}

/**
 * Create an AI adapter instance
 *
 * @param options - Optional configuration overrides
 * @returns AI adapter instance
 * @throws Error if provider is unknown or unavailable
 *
 * @example
 * ```typescript
 * // Use default provider (from AI_PROVIDER env var or ollama)
 * const adapter = createAIAdapter();
 *
 * // Force specific provider
 * const ollamaAdapter = createAIAdapter({ provider: 'ollama' });
 *
 * // With custom settings
 * const customAdapter = createAIAdapter({
 *   provider: 'ollama',
 *   host: 'http://custom-host:11434',
 *   model: 'llama3:8b'
 * });
 * ```
 */
export function createAIAdapter(
  options: CreateAIAdapterOptions = {},
): AIAdapter {
  const provider = options.provider || getDefaultProvider();

  switch (provider) {
    case "ollama":
      return new OllamaAdapter({
        host: options.host,
        model: options.model,
      });

    case "gemini":
      return new GeminiAdapter({
        apiKey: options.apiKey,
        model: options.model,
      });

    default:
      throw new Error(
        `Unknown AI provider: ${provider}. Supported providers: ollama, gemini`,
      );
  }
}

/**
 * Create an AI adapter with fallback to Ollama
 *
 * Per research.md: fallback to default provider if configured provider unavailable
 *
 * @param options - Optional configuration overrides
 * @returns AI adapter instance (primary or fallback)
 */
export async function createAIAdapterWithFallback(
  options: CreateAIAdapterOptions = {},
): Promise<AIAdapter> {
  const provider = options.provider || getDefaultProvider();

  // Try primary provider first
  if (provider !== "ollama") {
    try {
      const adapter = createAIAdapter(options);
      if (await adapter.isAvailable()) {
        return adapter;
      }
      console.warn(
        `AI provider ${provider} unavailable, falling back to Ollama`,
      );
    } catch (error) {
      console.warn(
        `AI provider ${provider} failed: ${error}, falling back to Ollama`,
      );
    }
  }

  // Fallback to Ollama
  const fallback = new OllamaAdapter({
    host: options.host,
    model: options.model,
  });

  if (!(await fallback.isAvailable())) {
    throw new Error(
      "No AI provider available. Please ensure Ollama is running at " +
        (options.host || process.env.OLLAMA_HOST || "http://localhost:11434"),
    );
  }

  return fallback;
}
